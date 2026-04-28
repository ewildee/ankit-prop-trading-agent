import type { CanonicalSymbol } from './symbols.ts';
import { type Timeframe, timeframeMs } from './timeframes.ts';

export const TWELVEDATA_MAX_BARS_PER_CALL = 5000 as const;
export const TWELVEDATA_PAGE_BAR_SAFETY_MARGIN = 0.75 as const;
export const TWELVEDATA_CREDITS_PER_TIMESERIES_CALL = 1 as const;
export const TWELVEDATA_CREDITS_PER_SYMBOL_SEARCH = 1 as const;
export const ESTIMATED_GZIP_BYTES_PER_BAR = 25 as const;

export type PlanRequest = {
  symbols: ReadonlyArray<CanonicalSymbol>;
  intradayTimeframes: ReadonlyArray<Timeframe>;
  intradayFromMs: number;
  intradayToMs: number;
  dailyTimeframes: ReadonlyArray<Timeframe>;
  dailyFromMs: number;
  dailyToMs: number;
};

type ShardPlan = {
  symbol: CanonicalSymbol;
  timeframe: Timeframe;
  fromMs: number;
  toMs: number;
  estimatedBars: number;
  estimatedCalls: number;
  estimatedCredits: number;
  estimatedBytesCompressed: number;
};

export type FetchPlan = {
  shards: ShardPlan[];
  symbolSearchCalls: number;
  totalCalls: number;
  totalCredits: number;
  totalEstimatedBars: number;
  totalEstimatedBytesCompressed: number;
};

const TRADING_HOURS_PER_CALENDAR_DAY: Record<CanonicalSymbol, number> = {
  NAS100: (6.5 * 5) / 7,
  XAUUSD: 24,
};

export function estimateBars(
  symbol: CanonicalSymbol,
  tf: Timeframe,
  fromMs: number,
  toMs: number,
): number {
  if (toMs <= fromMs) return 0;
  const calendarDays = (toMs - fromMs) / 86_400_000;
  if (tf === '1d') {
    return Math.ceil(calendarDays * (5 / 7));
  }
  const tradingHoursPerDay = TRADING_HOURS_PER_CALENDAR_DAY[symbol];
  const barsPerHour = 3_600_000 / timeframeMs(tf);
  return Math.ceil(calendarDays * tradingHoursPerDay * barsPerHour);
}

function planShard(
  symbol: CanonicalSymbol,
  tf: Timeframe,
  fromMs: number,
  toMs: number,
): ShardPlan {
  const bars = estimateBars(symbol, tf, fromMs, toMs);
  const effectiveBarsPerCall = TWELVEDATA_MAX_BARS_PER_CALL * TWELVEDATA_PAGE_BAR_SAFETY_MARGIN;
  const calls = bars === 0 ? 0 : Math.ceil(bars / effectiveBarsPerCall);
  return {
    symbol,
    timeframe: tf,
    fromMs,
    toMs,
    estimatedBars: bars,
    estimatedCalls: calls,
    estimatedCredits: calls * TWELVEDATA_CREDITS_PER_TIMESERIES_CALL,
    estimatedBytesCompressed: bars * ESTIMATED_GZIP_BYTES_PER_BAR,
  };
}

export function planFetch(req: PlanRequest): FetchPlan {
  const shards: ShardPlan[] = [];
  for (const symbol of req.symbols) {
    for (const tf of req.intradayTimeframes) {
      shards.push(planShard(symbol, tf, req.intradayFromMs, req.intradayToMs));
    }
    for (const tf of req.dailyTimeframes) {
      shards.push(planShard(symbol, tf, req.dailyFromMs, req.dailyToMs));
    }
  }
  const symbolSearchCalls = req.symbols.length * TWELVEDATA_CREDITS_PER_SYMBOL_SEARCH;
  const tsCalls = shards.reduce((s, x) => s + x.estimatedCalls, 0);
  const totalCalls = tsCalls + symbolSearchCalls;
  return {
    shards,
    symbolSearchCalls,
    totalCalls,
    totalCredits: totalCalls,
    totalEstimatedBars: shards.reduce((s, x) => s + x.estimatedBars, 0),
    totalEstimatedBytesCompressed: shards.reduce((s, x) => s + x.estimatedBytesCompressed, 0),
  };
}

export function formatPlan(plan: FetchPlan): string {
  const lines: string[] = [];
  lines.push('TwelveData fetch plan (dry-run)');
  lines.push('================================');
  for (const s of plan.shards) {
    const fromIso = new Date(s.fromMs).toISOString();
    const toIso = new Date(s.toMs).toISOString();
    lines.push(
      `  ${s.symbol.padEnd(7)} ${s.timeframe.padEnd(4)} ${fromIso} -> ${toIso}  ` +
        `bars≈${s.estimatedBars.toString().padStart(7)} ` +
        `calls=${s.estimatedCalls.toString().padStart(3)} ` +
        `bytes(gz)≈${formatBytes(s.estimatedBytesCompressed)}`,
    );
  }
  lines.push('--------------------------------');
  lines.push(`  symbol_search calls : ${plan.symbolSearchCalls}`);
  lines.push(`  time_series calls   : ${plan.totalCalls - plan.symbolSearchCalls}`);
  lines.push(`  total calls         : ${plan.totalCalls}`);
  lines.push(`  total credits       : ${plan.totalCredits}`);
  lines.push(`  total bars (≈)      : ${plan.totalEstimatedBars}`);
  lines.push(`  total bytes (gz, ≈) : ${formatBytes(plan.totalEstimatedBytesCompressed)}`);
  return lines.join('\n');
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}
