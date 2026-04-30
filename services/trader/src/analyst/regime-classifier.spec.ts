import { describe, expect, test } from 'bun:test';
import type { CalendarItem } from '@ankit-prop/contracts';
import type { Bar } from '@ankit-prop/market-data';
import { loadPersonaConfig } from '../persona-config/loader.ts';
import { classifyRegime } from './regime-classifier.ts';

describe('classifyRegime', () => {
  test('returns outside_active_window before the configured Prague active window', async () => {
    const params = await loadPersonaConfig();
    const bars = barsFromCloses('2026-04-30T04:00:00.000Z', [2300, 2300.5, 2300.25]);

    expect(classifyRegime({ bar: bars.at(-1)!, recentBars: bars, params })).toBe(
      'outside_active_window',
    );
  });

  test('detects the v_ankit_classic session breakout window', async () => {
    const params = await loadPersonaConfig();
    const bars = barsFromCloses(
      '2026-04-30T12:10:00.000Z',
      [2300, 2300.2, 2300.3, 2300.45, 2301.2, 2303.4],
    );

    expect(classifyRegime({ bar: bars.at(-1)!, recentBars: bars, params })).toBe('A_session_break');
  });

  test('detects a trend retrace after an active-window directional move', async () => {
    const params = await loadPersonaConfig();
    const bars = barsFromCandles('2026-04-30T14:00:00.000Z', [
      [2300, 2300.8, 2299.8, 2300.6],
      [2300.6, 2302, 2300.4, 2301.8],
      [2301.8, 2303.1, 2301.6, 2302.9],
      [2302.9, 2304.6, 2302.7, 2304.3],
      [2304.3, 2305.8, 2304.1, 2305.4],
      [2305.4, 2305.5, 2304.7, 2304.9],
    ]);

    expect(classifyRegime({ bar: bars.at(-1)!, recentBars: bars, params })).toBe('B_trend_retrace');
  });

  test('detects a consolidation break', async () => {
    const params = await loadPersonaConfig();
    const bars = barsFromCloses(
      '2026-04-30T15:00:00.000Z',
      [2300, 2300.05, 2300.02, 2300.07, 2300.1, 2300.7],
    );

    expect(classifyRegime({ bar: bars.at(-1)!, recentBars: bars, params })).toBe(
      'B_consolidation_break',
    );
  });

  test('detects a reversal wick after directional extension', async () => {
    const params = await loadPersonaConfig();
    const bars = barsFromCandles('2026-04-30T16:00:00.000Z', [
      [2300, 2301, 2299.8, 2301],
      [2301, 2302.5, 2300.8, 2302.4],
      [2302.4, 2304, 2302.2, 2303.8],
      [2303.8, 2305.2, 2303.6, 2305],
      [2305, 2306.5, 2304.8, 2306.2],
      [2306.2, 2311, 2305.8, 2306.3],
    ]);

    expect(classifyRegime({ bar: bars.at(-1)!, recentBars: bars, params })).toBe('B_reversal');
  });

  test('prioritises restricted macro lookahead inside the active window', async () => {
    const params = await loadPersonaConfig();
    const bars = barsFromCloses(
      '2026-04-30T14:00:00.000Z',
      [2300, 2301.2, 2302.5, 2304.1, 2305.4, 2304.9],
    );
    const calendarLookahead: CalendarItem[] = [
      {
        title: 'US CPI',
        impact: 'high',
        instrument: 'USD + XAUUSD',
        restriction: true,
        eventType: 'normal',
        date: '2026-04-30T16:30:00+02:00',
        forecast: null,
        previous: null,
        actual: null,
        youtubeLink: null,
        articleLink: null,
      },
    ];

    expect(classifyRegime({ bar: bars.at(-1)!, recentBars: bars, calendarLookahead, params })).toBe(
      'C_macro_filter',
    );
  });
});

function barsFromCloses(startIso: string, closes: number[]): Bar[] {
  return barsFromCandles(
    startIso,
    closes.map((close) => [close - 0.2, close + 0.3, close - 0.4, close]),
  );
}

function barsFromCandles(
  startIso: string,
  candles: Array<[open: number, high: number, low: number, close: number]>,
): Bar[] {
  const start = Date.parse(startIso);
  return candles.map(([open, high, low, close], index) => ({
    symbol: 'XAUUSD',
    timeframe: '5m',
    tsStart: start + index * 300_000,
    tsEnd: start + (index + 1) * 300_000,
    open,
    high,
    low,
    close,
    volume: 1000 + index,
  }));
}
