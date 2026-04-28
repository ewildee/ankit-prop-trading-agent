import { describe, expect, test } from 'bun:test';
import { estimateBars, formatPlan, planFetch, TWELVEDATA_MAX_BARS_PER_CALL } from './planner.ts';

const MS_PER_DAY = 86_400_000;

describe('estimateBars', () => {
  test('zero range yields zero bars', () => {
    const t = Date.UTC(2026, 0, 1);
    expect(estimateBars('NAS100', '1m', t, t)).toBe(0);
    expect(estimateBars('XAUUSD', '1m', t, t)).toBe(0);
  });

  test('XAUUSD 24x5 gives more bars than NAS100 6.5x5 over the same window', () => {
    const from = Date.UTC(2026, 0, 1);
    const to = from + 30 * MS_PER_DAY;
    const xauBars = estimateBars('XAUUSD', '1m', from, to);
    const ndxBars = estimateBars('NAS100', '1m', from, to);
    expect(xauBars).toBeGreaterThan(ndxBars * 2);
  });

  test('1d collapses to weekday count regardless of symbol', () => {
    const from = Date.UTC(2026, 0, 1);
    const to = from + 30 * MS_PER_DAY;
    const xauD = estimateBars('XAUUSD', '1d', from, to);
    const ndxD = estimateBars('NAS100', '1d', from, to);
    expect(xauD).toBe(ndxD);
    expect(xauD).toBeGreaterThan(20);
    expect(xauD).toBeLessThan(24);
  });
});

describe('planFetch', () => {
  const intradayFrom = Date.UTC(2026, 0, 28);
  const intradayTo = Date.UTC(2026, 3, 28);
  const dailyFrom = Date.UTC(2025, 9, 28);
  const dailyTo = Date.UTC(2026, 3, 28);

  test('emits one shard per (symbol × timeframe) and sums credits', () => {
    const plan = planFetch({
      symbols: ['NAS100', 'XAUUSD'],
      intradayTimeframes: ['1m', '5m', '15m', '1h'],
      intradayFromMs: intradayFrom,
      intradayToMs: intradayTo,
      dailyTimeframes: ['1d'],
      dailyFromMs: dailyFrom,
      dailyToMs: dailyTo,
    });
    expect(plan.shards).toHaveLength(2 * (4 + 1));
    expect(plan.symbolSearchCalls).toBe(2);
    const summed = plan.shards.reduce((s, x) => s + x.estimatedCredits, 0);
    expect(plan.totalCredits).toBe(summed + plan.symbolSearchCalls);
  });

  test('every shard fits in ≤5000 bars per call (calls = ceil(bars/max))', () => {
    const plan = planFetch({
      symbols: ['NAS100', 'XAUUSD'],
      intradayTimeframes: ['1m', '5m', '15m', '1h'],
      intradayFromMs: intradayFrom,
      intradayToMs: intradayTo,
      dailyTimeframes: ['1d'],
      dailyFromMs: dailyFrom,
      dailyToMs: dailyTo,
    });
    for (const s of plan.shards) {
      const expectedCalls =
        s.estimatedBars === 0 ? 0 : Math.ceil(s.estimatedBars / TWELVEDATA_MAX_BARS_PER_CALL);
      expect(s.estimatedCalls).toBe(expectedCalls);
    }
  });

  test('total credit budget for the locked plan-rev-2 window stays under one Grow-tier minute', () => {
    const plan = planFetch({
      symbols: ['NAS100', 'XAUUSD'],
      intradayTimeframes: ['1m', '5m', '15m', '1h'],
      intradayFromMs: intradayFrom,
      intradayToMs: intradayTo,
      dailyTimeframes: ['1d'],
      dailyFromMs: dailyFrom,
      dailyToMs: dailyTo,
    });
    expect(plan.totalCredits).toBeLessThan(55);
  });

  test('formatPlan renders header and totals', () => {
    const plan = planFetch({
      symbols: ['NAS100'],
      intradayTimeframes: ['1h'],
      intradayFromMs: intradayFrom,
      intradayToMs: intradayTo,
      dailyTimeframes: ['1d'],
      dailyFromMs: dailyFrom,
      dailyToMs: dailyTo,
    });
    const txt = formatPlan(plan);
    expect(txt).toContain('TwelveData fetch plan (dry-run)');
    expect(txt).toContain('total credits');
    expect(txt).toContain('NAS100');
  });
});
