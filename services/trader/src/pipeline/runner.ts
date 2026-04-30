import {
  AnalystOutput,
  DecisionRecord,
  GatewayDecision,
  JudgeInput,
  JudgeOutput,
  type PersonaConfig,
  TraderOutput,
} from '@ankit-prop/contracts';
import type { Bar } from '@ankit-prop/market-data';
import type { PipelineContext, PipelineDeps, TraderStageInput } from './stages.ts';

export async function runDecision(
  bar: Bar,
  persona: PersonaConfig,
  deps: PipelineDeps,
): Promise<DecisionRecord> {
  const context: PipelineContext = {
    runId: deps.runId ?? crypto.randomUUID(),
    paramsHash: deps.paramsHash ?? hashPersonaConfig(persona),
    decidedAt: (deps.now?.() ?? new Date()).toISOString(),
  };
  const analystInput = { bar, persona, context };
  const analystOutput = AnalystOutput.parse(await deps.analyst.analyze(analystInput));
  const traderInput: TraderStageInput = { ...analystInput, analystOutput };
  const traderOutput = TraderOutput.parse(await deps.trader.decide(traderInput));

  const judgeOutput =
    traderOutput.action === 'HOLD'
      ? null
      : JudgeOutput.parse(
          await deps.judge.evaluate({
            judgeInput: JudgeInput.parse(
              deps.buildJudgeInput?.({ ...traderInput, traderOutput }) ??
                buildDefaultJudgeInput({ ...traderInput, traderOutput }),
            ),
            bar,
            persona,
            context,
          }),
        );

  const gatewayDecision = GatewayDecision.parse(
    await deps.gateway.decide({
      bar,
      persona,
      context,
      analystOutput,
      traderOutput,
      judgeOutput,
    }),
  );
  const record = DecisionRecord.parse({
    decisionId: crypto.randomUUID(),
    runId: context.runId,
    personaId: persona.personaId,
    instrument: persona.instrument,
    timeframe: persona.timeframe,
    barClosedAt: new Date(bar.tsEnd).toISOString(),
    paramsHash: context.paramsHash,
    analystOutput,
    traderOutput,
    judgeOutput,
    gatewayDecision,
    decidedAt: context.decidedAt,
  });

  await deps.reflector.reflect({
    bar,
    persona,
    context,
    analystOutput,
    traderOutput,
    judgeOutput,
    gatewayDecision,
  });

  return record;
}

function buildDefaultJudgeInput(
  input: TraderStageInput & { readonly traderOutput: TraderOutput },
): JudgeInput {
  const currentSpread = Math.max(input.bar.high - input.bar.low, Number.EPSILON);
  const typicalSpread = input.bar.close > Number.EPSILON ? input.bar.close : Number.EPSILON;
  return {
    traderOutput: input.traderOutput,
    analystOutput: input.analystOutput,
    riskBudgetRemaining: {
      dailyPct: Number.EPSILON,
      overallPct: Number.EPSILON,
    },
    openExposure: {
      totalPct: Number.EPSILON,
      sameDirectionPct: Number.EPSILON,
    },
    recentDecisions: [],
    calendarLookahead: [],
    spreadStats: {
      current: currentSpread,
      typical: typicalSpread,
    },
    strategyParams: input.persona as unknown as Record<string, unknown>,
  };
}

function hashPersonaConfig(persona: PersonaConfig): string {
  return new Bun.CryptoHasher('sha256').update(JSON.stringify(persona)).digest('hex');
}
