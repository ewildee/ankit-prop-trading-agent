import { emptyCostBreakdown } from './cost.ts';
import {
  buildBlackoutWindows,
  buildPreNewsWindows,
  FTMO_DEFAULT_LINE,
  FtmoSimulator,
  type FtmoSimulatorCfg,
  INTERNAL_DEFAULT_MARGINS,
} from './ftmo-rules.ts';
import { computeMetrics, emptyMetrics } from './metrics.ts';
import type { AccountConfig, CalendarEvent, ClosedTrade, EvalResult, SymbolMeta } from './types.ts';

export type RecordedDecision = {
  ts: number;
  trade: ClosedTrade;
};

export type PaperReplayInput = {
  strategyVersion: string;
  account: AccountConfig;
  decisionLog: ReadonlyArray<RecordedDecision>;
  events: ReadonlyArray<CalendarEvent>;
  symbols: ReadonlyArray<SymbolMeta>;
  hftMinHoldShareThreshold?: number;
  consistencyMaxShare?: number;
};

export function paperReplay(input: PaperReplayInput): EvalResult {
  if (input.decisionLog.length === 0) {
    return {
      metrics: emptyMetrics(),
      ftmoBreaches: [],
      costBreakdown: emptyCostBreakdown(),
      diagnostics: { strategyVersion: input.strategyVersion, replayedTrades: 0 },
    };
  }
  const sortedTrades = [...input.decisionLog]
    .map((d) => d.trade)
    .sort((a, b) => a.openedAt - b.openedAt);
  const internalMargins = INTERNAL_DEFAULT_MARGINS;
  const events = input.events.map((e) => ({
    tsMs: e.timestamp,
    symbols: e.symbols,
    restricted: e.restricted,
  }));
  const cfg: FtmoSimulatorCfg = {
    accountId: input.account.accountId,
    envelopeId: input.account.envelopeId,
    initialCapital: input.account.initialCapital,
    ftmoMargins: FTMO_DEFAULT_LINE,
    internalMargins,
    symbols: new Map(
      input.symbols.map((s) => [s.symbol, { pipSize: s.pipSize, contractSize: s.contractSize }]),
    ),
    newsBlackoutWindows: buildBlackoutWindows(events, internalMargins.newsBlackoutHalfWidthMs),
    preNewsBlackoutWindows: buildPreNewsWindows(events, internalMargins.preNewsBlackoutMs),
    weekendCloseTimestampsMs: input.account.weekendCloseTimestamp
      ? [input.account.weekendCloseTimestamp]
      : [],
    hftMinHoldShareThreshold: input.hftMinHoldShareThreshold ?? 0.05,
    consistencyMaxShare: input.consistencyMaxShare ?? 0.45,
    consistencyCheckEnabled: input.account.phase === 'funded',
    consistencyMinTrades: 10,
  };
  const sim = new FtmoSimulator(cfg);
  const firstTs = sortedTrades[0]?.openedAt ?? 0;
  sim.setInitialDay(firstTs, input.account.initialCapital);
  let balance = input.account.initialCapital;
  let lastDay = floorDay(firstTs);
  for (const t of sortedTrades) {
    const day = floorDay(t.closedAt);
    if (day !== lastDay) {
      sim.onDayRollover(t.closedAt, balance);
      lastDay = day;
    }
    sim.onEquity(t.openedAt, balance);
    sim.onTradeClose(t.closedAt, t);
    balance += t.realizedPnl;
    sim.onEquity(t.closedAt, balance);
  }
  sim.finalize(sortedTrades);
  const lastTs = sortedTrades.at(-1)?.closedAt ?? 0;
  const metrics = computeMetrics(input.account.initialCapital, sortedTrades, lastTs);
  return {
    metrics,
    ftmoBreaches: [...sim.getBreaches()],
    costBreakdown: emptyCostBreakdown(),
    diagnostics: {
      strategyVersion: input.strategyVersion,
      replayedTrades: sortedTrades.length,
      finalBalance: balance,
    },
  };
}

function floorDay(tsMs: number): number {
  return Math.floor(tsMs / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
}
