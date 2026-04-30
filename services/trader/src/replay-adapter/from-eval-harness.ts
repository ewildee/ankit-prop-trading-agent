import { appendFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PersonaConfig } from '@ankit-prop/contracts';
import {
  type AccountConfig,
  type BarStrategy,
  replayWithProvider,
  type SymbolMeta,
} from '@ankit-prop/eval-harness';
import type { Bar, IMarketDataProvider } from '@ankit-prop/market-data';
import { ZERO } from '../analyst/constants.ts';
import { createVAnkitClassicAnalyst } from '../analyst/index.ts';
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

  const deps = input.deps ?? createDefaultPipelineDeps(input);
  const decisions = [];
  for (const bar of bars) {
    const decision = await runDecision(bar, input.persona, { ...deps, runId: input.runId });
    decisions.push(decision);
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

function createDefaultPipelineDeps(input: TraderReplayInput): PipelineDeps {
  const symbolMeta = input.symbolMetas.find((meta) => meta.symbol === input.persona.instrument);
  return {
    runId: input.runId,
    analyst:
      input.persona.personaId === 'v_ankit_classic'
        ? createVAnkitClassicAnalyst()
        : createAnalystStub(),
    trader:
      input.persona.personaId === 'v_ankit_classic'
        ? createVAnkitClassicTrader({
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
      return {
        traderOutput: stageInput.traderOutput,
        analystOutput: stageInput.analystOutput,
        riskBudgetRemaining: {
          dailyPct: input.persona.risk.maxPerTradePct,
          overallPct: input.persona.risk.maxPerTradePct,
        },
        openExposure: {
          totalPct: ZERO,
          sameDirectionPct: ZERO,
        },
        recentDecisions: [],
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
