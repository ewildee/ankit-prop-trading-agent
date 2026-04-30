import { appendFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  type PersonaConfig,
  pragueDayBucket,
  type RecentDecisionSummary,
  type TraderOutput,
} from '@ankit-prop/contracts';
import {
  type AccountConfig,
  type BarStrategy,
  replayWithProvider,
  type SymbolMeta,
} from '@ankit-prop/eval-harness';
import type { Bar, IMarketDataProvider } from '@ankit-prop/market-data';
import { ZERO } from '../analyst/constants.ts';
import { type AnalystGenerator, createVAnkitClassicAnalyst } from '../analyst/index.ts';
import { createInProcessReplayGateway } from '../gateway/in-process.ts';
import { createVAnkitClassicJudge } from '../judge/policy.ts';
import { runDecision } from '../pipeline/runner.ts';
import type { PipelineDeps } from '../pipeline/stages.ts';
import { createAnalystStub } from '../pipeline/stubs/analyst.stub.ts';
import { createJudgeStub } from '../pipeline/stubs/judge.stub.ts';
import { createReflectorStub } from '../pipeline/stubs/reflector.stub.ts';
import { createTraderStub } from '../pipeline/stubs/trader.stub.ts';
import { type ReflectorReport, writeReflectorReport } from '../reflector/report.ts';
import { createVAnkitClassicTrader } from '../trader/policy.ts';

export type TraderReplayInput = {
  readonly runId: string;
  readonly persona: PersonaConfig;
  readonly provider: IMarketDataProvider;
  readonly symbols: ReadonlyArray<{ readonly symbol: string; readonly timeframe: string }>;
  readonly window: { readonly fromMs: number; readonly toMs: number };
  readonly account: AccountConfig;
  readonly symbolMetas: ReadonlyArray<SymbolMeta>;
  readonly logPath?: string;
  readonly deps?: PipelineDeps;
  readonly truncateLog?: boolean;
  readonly reflectAtEnd?: boolean;
  readonly reportOutputDir?: string;
  readonly analystGenerator?: AnalystGenerator;
};

export type TraderReplayResult = {
  readonly runId: string;
  readonly logPath: string;
  readonly decisions: Awaited<ReturnType<typeof runDecision>>[];
  readonly report: ReflectorReport | null;
};

export async function runTraderReplay(input: TraderReplayInput): Promise<TraderReplayResult> {
  const bars: Bar[] = [];
  const collector: BarStrategy = {
    name: `trader_decision_collector_${input.runId}`,
    onBar(bar) {
      if (bar.symbol === input.persona.instrument && bar.timeframe === input.persona.timeframe) {
        bars.push(bar);
      }
      return [];
    },
  };

  await replayWithProvider({
    strategyVersion: collector.name,
    account: input.account,
    provider: input.provider,
    symbols: input.symbols,
    window: input.window,
    symbolMetas: input.symbolMetas,
    strategy: collector,
  });

  const logPath = input.logPath ?? join('.dev', 'runs', input.runId, 'decisions.jsonl');
  await mkdir(dirname(logPath), { recursive: true });
  if (input.truncateLog ?? true) await rm(logPath, { force: true });

  const replayState = createReplayState(input.persona);
  const deps = input.deps ?? createDefaultPipelineDeps(input, replayState);
  const decisions = [];
  for (const bar of bars) {
    replayState.advanceDay(bar);
    const decision = await runDecision(bar, input.persona, { ...deps, runId: input.runId });
    decisions.push(decision);
    replayState.recordDecision(decision);
    await appendFile(logPath, `${JSON.stringify(decision)}\n`);
  }

  const reportOutputDir = input.reportOutputDir ?? (input.logPath ? dirname(logPath) : undefined);
  const report =
    (input.reflectAtEnd ?? true)
      ? await writeReflectorReport({
          runId: input.runId,
          decisionsPath: logPath,
          ...(reportOutputDir ? { outputDir: reportOutputDir } : {}),
        })
      : null;

  return { runId: input.runId, logPath, decisions, report };
}

type ReplayOpenPosition = {
  readonly id: string;
  readonly side: 'BUY' | 'SELL';
  readonly pctEquity: number;
};

type ReplayState = {
  readonly openPosition: () => ReplayOpenPosition | null;
  readonly riskBudgetRemaining: () => { readonly dailyPct: number; readonly overallPct: number };
  readonly recentDecisions: () => RecentDecisionSummary[];
  readonly advanceDay: (bar: Bar) => void;
  readonly recordDecision: (decision: Awaited<ReturnType<typeof runDecision>>) => void;
};

function createReplayState(persona: PersonaConfig): ReplayState {
  let openPosition: ReplayOpenPosition | null = null;
  // Risk-day bucket is keyed off Europe/Prague (FTMO server clock per BLUEPRINT
  // §0.2 timezone discipline and §8.3 day_start_balance). UTC bucketing rolled
  // over inside the same FTMO daily bucket and would let extra replay risk slip
  // through (ANKA-339 BLOCK).
  let riskDayKey: number | null = null;
  let dailyRiskUsedPct = ZERO;

  return {
    openPosition: () => openPosition,
    riskBudgetRemaining: () => {
      const remainingPct = Math.max(ZERO, persona.risk.maxPerTradePct - dailyRiskUsedPct);
      return {
        dailyPct: remainingPct,
        overallPct: remainingPct,
      };
    },
    recentDecisions: () => [],
    advanceDay(bar) {
      const nextDayKey = pragueDayBucket(bar.tsEnd);
      if (riskDayKey === nextDayKey) return;
      riskDayKey = nextDayKey;
      dailyRiskUsedPct = ZERO;
    },
    recordDecision(decision) {
      const { gatewayDecision, traderOutput } = decision;
      if (gatewayDecision?.status !== 'submitted') return;
      if (traderOutput.action === 'OPEN') {
        openPosition = {
          id: traderOutput.idempotencyKey,
          side: traderOutput.side,
          pctEquity: traderOutput.size.pctEquity,
        };
        dailyRiskUsedPct += traderOutput.size.pctEquity;
        return;
      }
      if (traderOutput.action === 'CLOSE') {
        openPosition = null;
      }
    },
  };
}

function createDefaultPipelineDeps(
  input: TraderReplayInput,
  replayState: ReplayState,
): PipelineDeps {
  const symbolMeta = input.symbolMetas.find((meta) => meta.symbol === input.persona.instrument);
  return {
    runId: input.runId,
    analyst:
      input.persona.personaId === 'v_ankit_classic'
        ? input.analystGenerator
          ? createVAnkitClassicAnalyst({ generator: input.analystGenerator })
          : createVAnkitClassicAnalyst()
        : createAnalystStub(),
    trader:
      input.persona.personaId === 'v_ankit_classic'
        ? createVAnkitClassicTrader({
            openPosition: () => replayState.openPosition(),
            currentEquity: () => input.account.initialCapital,
            recentAtrPips: (stageInput) => Math.abs(stageInput.bar.high - stageInput.bar.low),
          })
        : createTraderStub(),
    judge:
      input.persona.personaId === 'v_ankit_classic'
        ? createVAnkitClassicJudge()
        : createJudgeStub(),
    gateway: createInProcessReplayGateway(),
    reflector: createReflectorStub(),
    buildJudgeInput(stageInput) {
      const openPosition = replayState.openPosition();
      const sameDirectionPct =
        openPosition !== null && sameDirectionOpen(stageInput.traderOutput, openPosition.side)
          ? openPosition.pctEquity
          : ZERO;
      return {
        traderOutput: stageInput.traderOutput,
        analystOutput: stageInput.analystOutput,
        riskBudgetRemaining: replayState.riskBudgetRemaining(),
        openExposure: {
          totalPct: openPosition?.pctEquity ?? ZERO,
          sameDirectionPct,
        },
        recentDecisions: replayState.recentDecisions(),
        calendarLookahead: [],
        spreadStats: {
          current: symbolMeta?.typicalSpreadPips ?? input.persona.filters.maxSpreadMultiplier,
          typical: symbolMeta?.typicalSpreadPips ?? input.persona.filters.maxSpreadMultiplier,
        },
        strategyParams: stageInput.persona as unknown as Record<string, unknown>,
      };
    },
  };
}

function sameDirectionOpen(
  traderOutput: TraderOutput,
  openSide: ReplayOpenPosition['side'],
): boolean {
  return traderOutput.action === 'OPEN' && traderOutput.side === openSide;
}
