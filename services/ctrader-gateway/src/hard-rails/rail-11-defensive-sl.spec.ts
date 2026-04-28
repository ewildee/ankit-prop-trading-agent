// Rail 11 — defensive SL math, anchored to §8.3 (daily-floor mechanics)
// and §8.5 (per-trade pct cap). Two constraints, the tighter one wins.

import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { InMemoryIdempotencyStore } from './idempotency-store.ts';
import { captureLogger } from './logger.ts';
import { InMemoryNewsClient } from './news-client.ts';
import { computeDefensiveSlMath, evaluateDefensiveSl } from './rail-11-defensive-sl.ts';
import { InMemoryThrottleStore } from './throttle-store.ts';
import {
  type BrokerSnapshot,
  DEFAULT_RAIL_CONFIG,
  type NewOrderIntent,
  type RailContext,
  type SymbolMeta,
} from './types.ts';

const NOW = Date.parse('2026-04-27T16:00:00Z');

function symbol(): SymbolMeta {
  return {
    symbol: 'XAUUSD',
    enabled: true,
    typicalSpread: 0.3,
    atr14: 6,
    spreadGuardMultiplier: 3,
    forceFlatLeadMin: 5,
    preNewsFlattenLeadMin: 6,
    dollarsPerPricePerUnit: 100,
  };
}

function ctx(broker: Partial<BrokerSnapshot> = {}): RailContext {
  const base: BrokerSnapshot = {
    nowMs: NOW,
    accountId: 'a',
    envelopeId: 'e',
    initialBalance: 100_000,
    dayStartBalance: 100_000,
    closedBalance: 100_000,
    equity: 100_000,
    positions: [],
    lastTradeBySymbol: {},
    symbol: symbol(),
    bid: 2400,
    ask: 2400.2,
    phase: 'phase_1',
    profitTarget: { fractionOfInitial: 0.1, bufferFraction: 0.01, minDaysComplete: false },
    envelopeFloors: {
      internalDailyLossFraction: 0.04,
      internalOverallLossFraction: 0.08,
    },
    defensiveSlMaxLossFraction: 0.005,
    marketCloseAtMs: NOW + 24 * 60 * 60 * 1000,
  };
  return {
    broker: { ...base, ...broker },
    news: new InMemoryNewsClient({ lastSuccessfulFetchAtMs: NOW }),
    idempotency: new InMemoryIdempotencyStore(),
    throttle: new InMemoryThrottleStore(),
    logger: captureLogger(),
    config: DEFAULT_RAIL_CONFIG,
  };
}

function intent(overrides: Partial<NewOrderIntent> = {}): NewOrderIntent {
  return {
    kind: 'NEW',
    clientOrderId: 'cid',
    accountId: 'a',
    envelopeId: 'e',
    symbol: 'XAUUSD',
    side: 'BUY',
    volume: 1,
    entryPrice: 2400,
    stopLossPrice: 2399,
    intendedAtMs: NOW,
    ...overrides,
  };
}

describe('Rail 11 defensive SL math (§8.3 / §8.5)', () => {
  test('per-trade cap is tighter than daily-floor headroom', () => {
    // Headroom = equity (100_000) - (dayStart 100_000 - 4_000) = 4_000.
    // Per-trade cap = 100_000 × 0.5/100 = 500. Tighter wins → 500.
    const m = computeDefensiveSlMath(intent(), ctx());
    expect(m.perTradeCapDollars).toBe(500);
    expect(m.dailyFloorHeadroomDollars).toBe(4000);
    expect(m.maxAllowedLossDollars).toBe(500);
    expect(m.requiredSlDistance).toBe(5); // 500 / (1 × 100)
    expect(m.internalDailyFloor).toBe(96_000);
  });

  test('daily-floor headroom is tighter than per-trade cap (eaten into floor)', () => {
    // Equity already pulled down so headroom < per-trade cap.
    const m = computeDefensiveSlMath(
      intent(),
      ctx({ equity: 96_300 }), // headroom = 300
    );
    expect(m.perTradeCapDollars).toBe(500);
    expect(m.dailyFloorHeadroomDollars).toBe(300);
    expect(m.maxAllowedLossDollars).toBe(300);
    expect(m.requiredSlDistance).toBe(3);
  });

  test('zero headroom rejects (cannot open new exposure)', () => {
    const decision = evaluateDefensiveSl(intent(), ctx({ equity: 96_000 }));
    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toMatch(/no envelope-floor headroom/);
  });

  test('SL on wrong side rejects (no tightening across entry)', () => {
    const decision = evaluateDefensiveSl(intent({ entryPrice: 2400, stopLossPrice: 2401 }), ctx());
    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toMatch(/wrong side/);
  });

  test('trader SL within cap → allow', () => {
    const decision = evaluateDefensiveSl(
      intent({ entryPrice: 2400, stopLossPrice: 2397 }), // distance 3 < required 5
      ctx(),
    );
    expect(decision.outcome).toBe('allow');
  });

  test('trader SL exceeds cap → tighten to entry ± requiredSlDistance', () => {
    const decision = evaluateDefensiveSl(
      intent({ entryPrice: 2400, stopLossPrice: 2390 }), // distance 10 > required 5
      ctx(),
    );
    expect(decision.outcome).toBe('tighten');
    expect(decision.detail.tightenedSlPrice).toBe(2395);
  });

  test('SELL side: tighten pulls SL down toward entry', () => {
    const decision = evaluateDefensiveSl(
      intent({ side: 'SELL', entryPrice: 2400, stopLossPrice: 2412 }),
      ctx(),
    );
    expect(decision.outcome).toBe('tighten');
    expect(decision.detail.tightenedSlPrice).toBe(2405);
  });

  test('AMEND/CLOSE intents are not subject to defensive SL', () => {
    const amend = evaluateDefensiveSl(
      {
        kind: 'AMEND',
        clientOrderId: 'cid',
        accountId: 'a',
        envelopeId: 'e',
        symbol: 'XAUUSD',
        positionId: 'p',
        side: 'BUY',
        prevStopLossPrice: 2399,
        newStopLossPrice: 2399.5,
        intendedAtMs: NOW,
      },
      ctx(),
    );
    expect(amend.outcome).toBe('allow');
  });

  test('every decision logs structured payload with required §9 keys', () => {
    const c = ctx();
    evaluateDefensiveSl(intent({ stopLossPrice: 2390 }), c);
    const log = c.logger as ReturnType<typeof captureLogger>;
    expect(log.events.length).toBeGreaterThanOrEqual(1);
    const ev = log.events[0];
    expect(ev?.payload.rail).toBe('defensive_sl');
    expect(ev?.payload.symbol).toBe('XAUUSD');
    expect(ev?.payload.outcome).toBe('tighten');
    expect(ev?.payload.reason.length).toBeGreaterThan(0);
  });

  // Suppress unused-import warning under strict noUnusedLocals if added later.
  test('Database from bun:sqlite is reachable (env smoke)', () => {
    const db = new Database(':memory:');
    expect(db).toBeDefined();
    db.close();
  });
});
