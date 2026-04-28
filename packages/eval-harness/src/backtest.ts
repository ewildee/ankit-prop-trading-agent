import { emptyCostBreakdown } from './cost.ts';
import {
  buildBlackoutWindows,
  buildPreNewsWindows,
  FTMO_DEFAULT_LINE,
  FtmoSimulator,
  type FtmoSimulatorCfg,
  INTERNAL_DEFAULT_MARGINS,
} from './ftmo-rules.ts';
import { computeMetrics } from './metrics.ts';
import { pragueDayStartFromMs, runBarSimulation } from './sim-engine.ts';
import type {
  AccountConfig,
  Bar,
  BarStrategy,
  CalendarEvent,
  CostBreakdown,
  EvalResult,
  SymbolMeta,
} from './types.ts';

export type BacktestInput = {
  strategyVersion: string;
  account: AccountConfig;
  bars: ReadonlyArray<Bar>;
  symbols: ReadonlyArray<SymbolMeta>;
  events: ReadonlyArray<CalendarEvent>;
  strategy: BarStrategy;
  costBreakdown?: CostBreakdown;
  hftMinHoldShareThreshold?: number;
  consistencyMaxShare?: number;
  consistencyCheckEnabled?: boolean;
  consistencyMinTrades?: number;
  ftmoMargins?: Partial<typeof FTMO_DEFAULT_LINE>;
  internalMargins?: Partial<typeof INTERNAL_DEFAULT_MARGINS>;
};

export function backtest(input: BacktestInput): EvalResult {
  const symbolMap = new Map(input.symbols.map((s) => [s.symbol, s]));
  const ftmoMargins = { ...FTMO_DEFAULT_LINE, ...input.ftmoMargins };
  const internalMargins = { ...INTERNAL_DEFAULT_MARGINS, ...input.internalMargins };
  const events = input.events.map((e) => ({
    tsMs: e.timestamp,
    symbols: e.symbols,
    restricted: e.restricted,
    impact: e.impact,
  }));

  const newsWindows = buildBlackoutWindows(events, internalMargins.newsBlackoutHalfWidthMs);
  const preWindows = buildPreNewsWindows(events, internalMargins.preNewsBlackoutMs);

  const simCfg: FtmoSimulatorCfg = {
    accountId: input.account.accountId,
    envelopeId: input.account.envelopeId,
    initialCapital: input.account.initialCapital,
    ftmoMargins,
    internalMargins,
    symbols: new Map(
      [...symbolMap.entries()].map(([k, v]) => [
        k,
        { pipSize: v.pipSize, contractSize: v.contractSize },
      ]),
    ),
    newsBlackoutWindows: newsWindows,
    preNewsBlackoutWindows: preWindows,
    weekendCloseTimestampsMs: input.account.weekendCloseTimestamp
      ? [input.account.weekendCloseTimestamp]
      : [],
    hftMinHoldShareThreshold: input.hftMinHoldShareThreshold ?? 0.05,
    consistencyMaxShare: input.consistencyMaxShare ?? 0.45,
    consistencyCheckEnabled: input.consistencyCheckEnabled ?? input.account.phase === 'funded',
    consistencyMinTrades: input.consistencyMinTrades ?? 10,
  };

  const ftmo = new FtmoSimulator(simCfg);
  const inWindow = (windows: typeof newsWindows) => (symbol: string, t: number) =>
    windows.some((w) => w.symbols.has(symbol) && t >= w.startMs && t <= w.endMs);

  const run = runBarSimulation({
    strategy: input.strategy,
    initialCapital: input.account.initialCapital,
    symbols: symbolMap,
    bars: input.bars,
    ftmoSimulator: ftmo,
    newsBlackout: inWindow(newsWindows),
    preNewsBlackout: inWindow(preWindows),
    pragueDayStartFromMs,
    ...(input.account.weekendCloseTimestamp !== undefined
      ? { weekendCloseTimestampsMs: [input.account.weekendCloseTimestamp] }
      : {}),
  });

  const lastBar = input.bars.at(-1);
  const windowEndTs = lastBar ? lastBar.tsEnd : 0;
  const metrics = computeMetrics(input.account.initialCapital, run.trades, windowEndTs);

  return {
    metrics,
    ftmoBreaches: [...ftmo.getBreaches()],
    costBreakdown: input.costBreakdown ?? emptyCostBreakdown(),
    diagnostics: {
      strategyVersion: input.strategyVersion,
      strategyName: input.strategy.name,
      finalBalance: run.finalBalance,
      tradeCount: run.trades.length,
    },
  };
}
