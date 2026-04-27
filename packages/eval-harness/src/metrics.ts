import type { ClosedTrade, EvalMetrics } from './types.ts';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function buildEquityCurve(
  initialCapital: number,
  trades: ReadonlyArray<ClosedTrade>,
): { ts: number; equity: number }[] {
  const sorted = [...trades].sort((a, b) => a.closedAt - b.closedAt);
  let equity = initialCapital;
  const points: { ts: number; equity: number }[] = [{ ts: 0, equity }];
  for (const t of sorted) {
    equity += t.realizedPnl;
    points.push({ ts: t.closedAt, equity });
  }
  return points;
}

export function maxDrawdownPct(curve: ReadonlyArray<{ equity: number }>): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const p of curve) {
    if (p.equity > peak) peak = p.equity;
    if (peak > 0) {
      const dd = (peak - p.equity) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd * 100;
}

export function profitFactor(trades: ReadonlyArray<ClosedTrade>): number {
  let wins = 0;
  let losses = 0;
  for (const t of trades) {
    if (t.realizedPnl > 0) wins += t.realizedPnl;
    else if (t.realizedPnl < 0) losses += -t.realizedPnl;
  }
  if (losses === 0) return wins > 0 ? Number.POSITIVE_INFINITY : 0;
  return wins / losses;
}

export function winRate(trades: ReadonlyArray<ClosedTrade>): number {
  if (trades.length === 0) return 0;
  const wins = trades.filter((t) => t.realizedPnl > 0).length;
  return wins / trades.length;
}

export function averageRR(trades: ReadonlyArray<ClosedTrade>): number {
  if (trades.length === 0) return 0;
  const sum = trades.reduce((acc, t) => acc + t.rMultiple, 0);
  return sum / trades.length;
}

function dailyReturns(
  initialCapital: number,
  trades: ReadonlyArray<ClosedTrade>,
  windowEndTs: number,
): number[] {
  if (trades.length === 0) return [];
  const sorted = [...trades].sort((a, b) => a.closedAt - b.closedAt);
  const start = Math.floor((sorted[0]?.closedAt ?? 0) / ONE_DAY_MS) * ONE_DAY_MS;
  const end = Math.floor(windowEndTs / ONE_DAY_MS) * ONE_DAY_MS;
  const buckets = new Map<number, number>();
  for (const t of sorted) {
    const day = Math.floor(t.closedAt / ONE_DAY_MS) * ONE_DAY_MS;
    buckets.set(day, (buckets.get(day) ?? 0) + t.realizedPnl);
  }
  const returns: number[] = [];
  let runningEquity = initialCapital;
  for (let day = start; day <= end; day += ONE_DAY_MS) {
    const pnl = buckets.get(day) ?? 0;
    if (runningEquity <= 0) break;
    returns.push(pnl / runningEquity);
    runningEquity += pnl;
  }
  return returns;
}

export function sortinoRolling(
  initialCapital: number,
  trades: ReadonlyArray<ClosedTrade>,
  windowEndTs: number,
  windowDays = 60,
): number {
  const all = dailyReturns(initialCapital, trades, windowEndTs);
  if (all.length === 0) return 0;
  const window = all.slice(-windowDays);
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  const downside = window.filter((r) => r < 0);
  if (downside.length === 0) return mean === 0 ? 0 : Number.POSITIVE_INFINITY;
  const variance = downside.reduce((a, b) => a + b * b, 0) / downside.length;
  const downsideStdev = Math.sqrt(variance);
  if (downsideStdev === 0) return 0;
  return (mean / downsideStdev) * Math.sqrt(252);
}

export function computeMetrics(
  initialCapital: number,
  trades: ReadonlyArray<ClosedTrade>,
  windowEndTs: number,
): EvalMetrics {
  const curve = buildEquityCurve(initialCapital, trades);
  return {
    sortinoRolling60d: round(sortinoRolling(initialCapital, trades, windowEndTs, 60), 6),
    maxDrawdownPct: round(maxDrawdownPct(curve), 6),
    profitFactor: round(profitFactor(trades), 6),
    tradeCount: trades.length,
    winRate: round(winRate(trades), 6),
    averageRR: round(averageRR(trades), 6),
  };
}

function round(n: number, decimals: number): number {
  if (!Number.isFinite(n)) return n;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

export function emptyMetrics(): EvalMetrics {
  return {
    sortinoRolling60d: 0,
    maxDrawdownPct: 0,
    profitFactor: 0,
    tradeCount: 0,
    winRate: 0,
    averageRR: 0,
  };
}
