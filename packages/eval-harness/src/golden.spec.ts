import { describe, expect, test } from 'bun:test';
import { backtest } from './backtest.ts';
import type { GoldenFixture } from './fixtures/index.ts';
import {
  ALL_GOLDEN_FIXTURES,
  BAD_DAILY_LOSS_FIXTURE,
  BAD_MIN_HOLD_FIXTURE,
  BAD_NEWS_WINDOW_FIXTURE,
  BAD_WEEKEND_HOLD_FIXTURE,
  FLAT_FIXTURE,
  TRIVIAL_FIXTURE,
} from './fixtures/index.ts';

function runFixture(fx: GoldenFixture) {
  return backtest({
    strategyVersion: `golden:${fx.id}`,
    account: fx.account,
    bars: fx.bars,
    symbols: fx.symbols,
    events: fx.events,
    strategy: fx.strategy,
  });
}

describe('golden fixtures', () => {
  test('flat fixture: no trades, no breaches', () => {
    const r = runFixture(FLAT_FIXTURE);
    expect(r.metrics.tradeCount).toBe(0);
    expect(r.ftmoBreaches.length).toBe(0);
  });

  test('trivial fixture: deterministic 1 trade, 0 breaches', () => {
    const r = runFixture(TRIVIAL_FIXTURE);
    expect(r.metrics.tradeCount).toBe(1);
    expect(r.ftmoBreaches.length).toBe(0);
  });

  test('bad-daily-loss fixture: trips daily_loss', () => {
    const r = runFixture(BAD_DAILY_LOSS_FIXTURE);
    expect(r.ftmoBreaches.some((b) => b.kind === 'daily_loss')).toBe(true);
  });

  test('bad-news-window fixture: trips news_blackout_open', () => {
    const r = runFixture(BAD_NEWS_WINDOW_FIXTURE);
    expect(r.ftmoBreaches.some((b) => b.kind === 'news_blackout_open')).toBe(true);
  });

  test('bad-min-hold fixture: trips min_hold (and HFT classification)', () => {
    const r = runFixture(BAD_MIN_HOLD_FIXTURE);
    expect(r.ftmoBreaches.some((b) => b.kind === 'min_hold')).toBe(true);
  });

  test('bad-weekend-hold fixture: trips weekend_hold', () => {
    const r = runFixture(BAD_WEEKEND_HOLD_FIXTURE);
    expect(r.ftmoBreaches.some((b) => b.kind === 'weekend_hold')).toBe(true);
  });

  test('every fixture asserts its expected breach kinds', () => {
    for (const fx of ALL_GOLDEN_FIXTURES) {
      const r = runFixture(fx);
      for (const expected of fx.expects.breachKinds) {
        const present = r.ftmoBreaches.some((b) => b.kind === expected);
        expect(present, `fixture ${fx.id} missing expected breach ${expected}`).toBe(true);
      }
      if (fx.expects.deterministicTrades !== undefined) {
        expect(r.metrics.tradeCount).toBe(fx.expects.deterministicTrades);
      }
    }
  });
});
