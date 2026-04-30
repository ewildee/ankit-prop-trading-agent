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
import { createInProcessReplayGateway } from '../gateway/in-process.ts';
import { runDecision } from '../pipeline/runner.ts';
import type { PipelineDeps } from '../pipeline/stages.ts';
import { createAnalystStub } from '../pipeline/stubs/analyst.stub.ts';
import { createJudgeStub } from '../pipeline/stubs/judge.stub.ts';
import { createReflectorStub } from '../pipeline/stubs/reflector.stub.ts';
import { createTraderStub } from '../pipeline/stubs/trader.stub.ts';

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
};

export type TraderReplayResult = {
  readonly runId: string;
  readonly logPath: string;
  readonly decisions: Awaited<ReturnType<typeof runDecision>>[];
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

  const deps = input.deps ?? createStubbedPipelineDeps(input.runId);
  const decisions = [];
  for (const bar of bars) {
    const decision = await runDecision(bar, input.persona, { ...deps, runId: input.runId });
    decisions.push(decision);
    await appendFile(logPath, `${JSON.stringify(decision)}\n`);
  }

  return { runId: input.runId, logPath, decisions };
}

function createStubbedPipelineDeps(runId: string): PipelineDeps {
  return {
    runId,
    analyst: createAnalystStub(),
    trader: createTraderStub(),
    judge: createJudgeStub(),
    gateway: createInProcessReplayGateway(),
    reflector: createReflectorStub(),
  };
}
