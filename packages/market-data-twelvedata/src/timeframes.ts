export const INTRADAY_TIMEFRAMES = ['1m', '5m', '15m', '1h'] as const;
export const DAILY_TIMEFRAMES = ['1d'] as const;
export const ALL_TIMEFRAMES = [...INTRADAY_TIMEFRAMES, ...DAILY_TIMEFRAMES] as const;

export type IntradayTimeframe = (typeof INTRADAY_TIMEFRAMES)[number];
export type DailyTimeframe = (typeof DAILY_TIMEFRAMES)[number];
export type Timeframe = (typeof ALL_TIMEFRAMES)[number];

const MS_PER_TIMEFRAME: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

const TD_INTERVAL: Record<Timeframe, string> = {
  '1m': '1min',
  '5m': '5min',
  '15m': '15min',
  '1h': '1h',
  '1d': '1day',
};

export function timeframeMs(tf: Timeframe): number {
  return MS_PER_TIMEFRAME[tf];
}

export function twelveDataInterval(tf: Timeframe): string {
  return TD_INTERVAL[tf];
}

export function isTimeframe(s: string): s is Timeframe {
  return (ALL_TIMEFRAMES as readonly string[]).includes(s);
}
