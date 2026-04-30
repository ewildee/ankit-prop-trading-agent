import {
  AnalystOutput,
  composeRailVerdict,
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

  let judgeOutput: JudgeOutput | null = null;
  let gatewayDecision: GatewayDecision;
  if (traderOutput.action !== 'HOLD' && deps.buildJudgeInput === undefined) {
    gatewayDecision = GatewayDecision.parse({
      status: 'rejected_by_rails',
      traderOutput,
      railVerdict: composeRailVerdict([], context.decidedAt),
    });
  } else {
    judgeOutput =
      traderOutput.action === 'HOLD'
        ? null
        : JudgeOutput.parse(
            await deps.judge.evaluate({
              judgeInput: JudgeInput.parse(
                deps.buildJudgeInput?.({ ...traderInput, traderOutput }),
              ),
              bar,
              persona,
              context,
            }),
          );

    gatewayDecision = GatewayDecision.parse(
      await deps.gateway.decide({
        bar,
        persona,
        context,
        analystOutput,
        traderOutput,
        judgeOutput,
      }),
    );
  }

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

  void Promise.resolve()
    .then(() =>
      deps.reflector.reflect({
        bar,
        persona,
        context,
        analystOutput,
        traderOutput,
        judgeOutput,
        gatewayDecision,
      }),
    )
    .catch(() => undefined);

  return record;
}

function hashPersonaConfig(persona: PersonaConfig): string {
  return new Bun.CryptoHasher('sha256').update(JSON.stringify(persona)).digest('hex');
}
