import type { FtmoSimulator } from './ftmo-rules.ts';
import { pragueDayBucket } from './prague-day.ts';
import type {
  Bar,
  BarStrategy,
  ClosedTrade,
  OpenAction,
  Side,
  SimContext,
  SimPosition,
  StrategyAction,
  SymbolMeta,
} from './types.ts';

export type SimEngineCfg = {
  strategy: BarStrategy;
  initialCapital: number;
  symbols: ReadonlyMap<string, SymbolMeta>;
  bars: ReadonlyArray<Bar>;
  ftmoSimulator: FtmoSimulator;
  newsBlackout: (symbol: string, t: number) => boolean;
  preNewsBlackout: (symbol: string, t: number) => boolean;
  pragueDayStartFromMs: (tsMs: number) => number;
  weekendCloseTimestampsMs?: ReadonlyArray<number>;
};

export type SimEngineRun = {
  trades: ClosedTrade[];
  finalEquity: number;
  finalBalance: number;
};

export function runBarSimulation(cfg: SimEngineCfg): SimEngineRun {
  const symbols = cfg.symbols;
  let nextPositionId = 1;
  const open: SimPosition[] = [];
  const trades: ClosedTrade[] = [];
  let balance = cfg.initialCapital;
  let lastDayBucket = -1;
  let dayStartBalance = cfg.initialCapital;

  cfg.ftmoSimulator.setInitialDay(cfg.bars[0]?.tsStart ?? 0, cfg.initialCapital);

  for (let i = 0; i < cfg.bars.length; i++) {
    const bar = cfg.bars[i];
    if (!bar) continue;
    const meta = symbols.get(bar.symbol);
    if (!meta) continue;

    const dayBucket = cfg.pragueDayStartFromMs(bar.tsStart);
    if (lastDayBucket !== -1 && dayBucket !== lastDayBucket) {
      dayStartBalance = balance;
      cfg.ftmoSimulator.onDayRollover(bar.tsStart, balance);
    }
    lastDayBucket = dayBucket;

    for (let j = open.length - 1; j >= 0; j--) {
      const pos = open[j];
      if (!pos || pos.symbol !== bar.symbol) continue;
      const slHit = pos.side === 'long' ? bar.low <= pos.stopLoss : bar.high >= pos.stopLoss;
      const tpHit =
        pos.takeProfit !== undefined &&
        (pos.side === 'long' ? bar.high >= pos.takeProfit : bar.low <= pos.takeProfit);
      if (slHit) {
        const closed = closeAt(pos, pos.stopLoss, bar.tsEnd, meta, 'sl');
        balance += closed.realizedPnl;
        trades.push(closed);
        cfg.ftmoSimulator.onTradeClose(bar.tsEnd, closed);
        open.splice(j, 1);
      } else if (tpHit && pos.takeProfit !== undefined) {
        const closed = closeAt(pos, pos.takeProfit, bar.tsEnd, meta, 'tp');
        balance += closed.realizedPnl;
        trades.push(closed);
        cfg.ftmoSimulator.onTradeClose(bar.tsEnd, closed);
        open.splice(j, 1);
      }
    }

    const equity = balance + floatingPnl(open, bar.close, symbols);
    cfg.ftmoSimulator.onEquity(bar.tsEnd, equity);
    cfg.ftmoSimulator.onBarClose(bar.tsEnd, bar, open);
    if (cfg.weekendCloseTimestampsMs && open.length > 0) {
      for (const wt of cfg.weekendCloseTimestampsMs) {
        if (wt >= bar.tsStart && wt <= bar.tsEnd) {
          cfg.ftmoSimulator.checkWeekend(wt, open);
        }
      }
    }

    const ctx: SimContext = {
      now: bar.tsEnd,
      equity,
      balance,
      openPositions: open,
      symbols,
      newsBlackoutActive: cfg.newsBlackout,
      preNewsBlackoutActive: cfg.preNewsBlackout,
    };
    const actions = cfg.strategy.onBar(bar, ctx);
    for (const a of actions) {
      balance += applyAction(a, bar, meta, open, trades, cfg.ftmoSimulator, () => nextPositionId++);
    }
    void dayStartBalance;
  }

  for (const pos of open) {
    const lastBar = lastForSymbol(cfg.bars, pos.symbol);
    if (!lastBar) continue;
    const meta = symbols.get(pos.symbol);
    if (!meta) continue;
    const closed = closeAt(pos, lastBar.close, lastBar.tsEnd, meta, 'eod');
    balance += closed.realizedPnl;
    trades.push(closed);
    cfg.ftmoSimulator.onTradeClose(lastBar.tsEnd, closed);
  }

  cfg.ftmoSimulator.finalize(trades);

  return { trades, finalEquity: balance, finalBalance: balance };
}

// Returns the balance delta from this action. Only `close` realises P&L; open
// and amend produce no realised cash. The previous version dropped the
// strategy-close P&L on the floor, which let losing closes pass through eval
// gates without ever moving balance — masking daily/overall-loss breaches.
function applyAction(
  a: StrategyAction,
  bar: Bar,
  meta: SymbolMeta,
  open: SimPosition[],
  trades: ClosedTrade[],
  ftmo: FtmoSimulator,
  nextId: () => number,
): number {
  if (a.kind === 'open') {
    const pos = openPosition(a, bar, nextId());
    open.push(pos);
    ftmo.onTradeOpen(bar.tsEnd, pos);
    return 0;
  }
  if (a.kind === 'amend') {
    const idx = open.findIndex((p) => p.id === a.positionId);
    if (idx === -1) return 0;
    const cur = open[idx];
    if (!cur) return 0;
    open[idx] = { ...cur, stopLoss: a.stopLoss };
    ftmo.onTradeAmend(bar.tsEnd, a.positionId);
    return 0;
  }
  if (a.kind === 'close') {
    const idx = open.findIndex((p) => p.id === a.positionId);
    if (idx === -1) return 0;
    const pos = open[idx];
    if (!pos) return 0;
    const closed = closeAt(pos, bar.close, bar.tsEnd, meta, 'strategy');
    trades.push(closed);
    ftmo.onTradeClose(bar.tsEnd, closed);
    open.splice(idx, 1);
    return closed.realizedPnl;
  }
  return 0;
}

function openPosition(a: OpenAction, bar: Bar, id: number): SimPosition {
  const pos: SimPosition = {
    id: `p${id}`,
    symbol: a.symbol,
    side: a.side,
    sizeLots: a.sizeLots,
    openedAt: bar.tsEnd,
    openPrice: bar.close,
    stopLoss: a.stopLoss,
    ...(a.takeProfit !== undefined ? { takeProfit: a.takeProfit } : {}),
  };
  return pos;
}

function closeAt(
  pos: SimPosition,
  price: number,
  tsMs: number,
  meta: SymbolMeta,
  reason: ClosedTrade['closeReason'],
): ClosedTrade {
  const direction = pos.side === 'long' ? 1 : -1;
  const realizedPnl = (price - pos.openPrice) * direction * pos.sizeLots * meta.contractSize;
  const initialRisk = Math.abs(pos.openPrice - pos.stopLoss) * pos.sizeLots * meta.contractSize;
  const rMultiple = initialRisk === 0 ? 0 : realizedPnl / initialRisk;
  return {
    id: pos.id,
    symbol: pos.symbol,
    side: pos.side,
    sizeLots: pos.sizeLots,
    openedAt: pos.openedAt,
    closedAt: tsMs,
    openPrice: pos.openPrice,
    closePrice: price,
    realizedPnl,
    initialRisk,
    rMultiple,
    closeReason: reason,
  };
}

function floatingPnl(
  open: ReadonlyArray<SimPosition>,
  closePrice: number,
  symbols: ReadonlyMap<string, SymbolMeta>,
): number {
  let pnl = 0;
  for (const p of open) {
    const meta = symbols.get(p.symbol);
    if (!meta) continue;
    const dir: Side = p.side;
    const mul = dir === 'long' ? 1 : -1;
    pnl += (closePrice - p.openPrice) * mul * p.sizeLots * meta.contractSize;
  }
  return pnl;
}

function lastForSymbol(bars: ReadonlyArray<Bar>, symbol: string): Bar | undefined {
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i];
    if (b && b.symbol === symbol) return b;
  }
  return undefined;
}

// FTMO uses Europe/Prague for daily-floor reset. UTC bucketing drifted by
// 1–2 hours and could mask a same-day breach into the next bucket. See
// `prague-day.ts`.
export const pragueDayStartFromMs = pragueDayBucket;
