import { describe, expect, test } from 'bun:test';
import {
  averageRR,
  buildEquityCurve,
  computeMetrics,
  emptyMetrics,
  maxDrawdownPct,
  profitFactor,
  sortinoRolling,
  winRate,
} from './metrics.ts';
import type { ClosedTrade } from './types.ts';

const trade = (
  i: number,
  pnl: number,
  rMultiple = pnl / 100,
  closedAtMs = Date.UTC(2026, 0, 1) + i * 24 * 60 * 60 * 1000,
): ClosedTrade => ({
  id: `t${i}`,
  symbol: 'XAUUSD',
  side: 'long',
  sizeLots: 0.1,
  openedAt: closedAtMs - 60_000,
  closedAt: closedAtMs,
  openPrice: 2050,
  closePrice: 2050 + pnl / 10,
  realizedPnl: pnl,
  initialRisk: 100,
  rMultiple,
  closeReason: pnl > 0 ? 'tp' : pnl < 0 ? 'sl' : 'strategy',
});

describe('metrics', () => {
  test('emptyMetrics is zeroed', () => {
    expect(emptyMetrics()).toEqual({
      sortinoRolling60d: 0,
      maxDrawdownPct: 0,
      profitFactor: 0,
      tradeCount: 0,
      winRate: 0,
      averageRR: 0,
    });
  });

  test('profit factor handles wins and losses', () => {
    const trades = [trade(0, 100), trade(1, -50), trade(2, 200), trade(3, -100)];
    expect(profitFactor(trades)).toBeCloseTo((100 + 200) / (50 + 100), 5);
  });

  test('profit factor with no losses returns Infinity', () => {
    expect(profitFactor([trade(0, 100)])).toBe(Number.POSITIVE_INFINITY);
  });

  test('win rate', () => {
    expect(winRate([trade(0, 100), trade(1, -50)])).toBe(0.5);
    expect(winRate([])).toBe(0);
  });

  test('averageRR averages r-multiples', () => {
    const trades = [trade(0, 200, 2), trade(1, -100, -1)];
    expect(averageRR(trades)).toBe(0.5);
  });

  test('max drawdown picks worst peak-to-trough', () => {
    const curve = buildEquityCurve(100_000, [
      trade(0, 5_000),
      trade(1, -8_000),
      trade(2, 1_000),
      trade(3, -3_000),
    ]);
    const dd = maxDrawdownPct(curve);
    expect(dd).toBeGreaterThan(0);
    expect(dd).toBeLessThan(20);
  });

  test('sortino zero when no downside days', () => {
    const trades = [trade(0, 100), trade(1, 200)];
    expect(sortinoRolling(100_000, trades, trades[1]?.closedAt ?? 0)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  test('computeMetrics returns all six fields', () => {
    const trades = [trade(0, 100), trade(1, -50)];
    const m = computeMetrics(100_000, trades, trades[1]?.closedAt ?? 0);
    expect(m.tradeCount).toBe(2);
    expect(m.winRate).toBe(0.5);
    expect(m.profitFactor).toBeCloseTo(2, 5);
    expect(m.maxDrawdownPct).toBeGreaterThanOrEqual(0);
  });
});
