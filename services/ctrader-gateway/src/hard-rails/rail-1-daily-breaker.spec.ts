// Rail 1 — daily breaker boundary lock (BLUEPRINT §8.3 / §9).
// [ANKA-38](/ANKA/issues/ANKA-38) adds per-rail coverage for the
// envelope-wide 4% internal daily loss floor. The rail rejects every intent
// shape after equity has crossed below the locked-at-midnight floor.

import { describe, expect, test } from 'bun:test';
import { InMemoryIdempotencyStore } from './idempotency-store.ts';
import { captureLogger } from './logger.ts';
import { InMemoryNewsClient } from './news-client.ts';
import { evaluateDailyBreaker } from './rail-1-daily-breaker.ts';
import { InMemoryThrottleStore } from './throttle-store.ts';
import {
  type AmendOrderIntent,
  type BrokerSnapshot,
  type CloseOrderIntent,
  DEFAULT_RAIL_CONFIG,
  type NewOrderIntent,
  type RailContext,
  type RailIntent,
  type SymbolMeta,
} from './types.ts';

const NOW = Date.parse('2026-04-27T16:00:00Z');
const ACCOUNT = 'ftmo-2step-100k-1';
const ENVELOPE = 'ftmo-2step-#1';
const SYMBOL = 'XAUUSD';

function symbol(): SymbolMeta {
  return {
    symbol: SYMBOL,
    enabled: true,
    typicalSpread: 0.3,
    atr14: 6,
    spreadGuardMultiplier: 3,
    forceFlatLeadMin: 5,
    preNewsFlattenLeadMin: 6,
    dollarsPerPricePerUnit: 100,
  };
}

function broker(overrides: Partial<BrokerSnapshot> = {}): BrokerSnapshot {
  const base: BrokerSnapshot = {
    nowMs: NOW,
    accountId: ACCOUNT,
    envelopeId: ENVELOPE,
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
  return { ...base, ...overrides };
}

function ctx(overrides: Partial<BrokerSnapshot> = {}): RailContext {
  return {
    broker: broker(overrides),
    news: new InMemoryNewsClient({ lastSuccessfulFetchAtMs: NOW }),
    idempotency: new InMemoryIdempotencyStore(),
    throttle: new InMemoryThrottleStore(),
    logger: captureLogger(),
    config: DEFAULT_RAIL_CONFIG,
  };
}

function newOrderIntent(clientOrderId = 'cid-rail1-new'): NewOrderIntent {
  return {
    kind: 'NEW',
    clientOrderId,
    accountId: ACCOUNT,
    envelopeId: ENVELOPE,
    symbol: SYMBOL,
    side: 'BUY',
    volume: 1,
    entryPrice: 2400,
    stopLossPrice: 2399,
    intendedAtMs: NOW,
  };
}

function amendIntent(clientOrderId = 'cid-rail1-amend'): AmendOrderIntent {
  return {
    kind: 'AMEND',
    clientOrderId,
    accountId: ACCOUNT,
    envelopeId: ENVELOPE,
    symbol: SYMBOL,
    positionId: 'pos-1',
    side: 'BUY',
    prevStopLossPrice: 2399,
    newStopLossPrice: 2399.5,
    intendedAtMs: NOW,
  };
}

function closeIntent(clientOrderId = 'cid-rail1-close'): CloseOrderIntent {
  return {
    kind: 'CLOSE',
    clientOrderId,
    accountId: ACCOUNT,
    envelopeId: ENVELOPE,
    symbol: SYMBOL,
    positionId: 'pos-1',
    intendedAtMs: NOW,
  };
}

function intentShapes(): RailIntent[] {
  return [newOrderIntent(), closeIntent(), amendIntent()];
}

describe('rail 1 — daily breaker', () => {
  test('equity above internal daily floor allows', () => {
    const c = ctx({ equity: 99_000 });
    const decision = evaluateDailyBreaker(newOrderIntent(), c);

    expect(decision.outcome).toBe('allow');
    expect(decision.rail).toBe('daily_breaker');
    expect(decision.reason).toBe('equity above internal-daily-floor');
    expect(decision.detail?.internalDailyFloor).toBe(96_000);
    expect(decision.decidedAt).toBe(new Date(NOW).toISOString());
  });

  test('equity strictly below internal daily floor rejects with computed detail', () => {
    const c = ctx({ equity: 95_999.99 });
    const decision = evaluateDailyBreaker(newOrderIntent(), c);

    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toContain('equity 95999.99 < internal-daily-floor 96000.00');
    expect(decision.detail).toMatchObject({
      equity: 95_999.99,
      dayStartBalance: 100_000,
      initialBalance: 100_000,
      internalDailyFloor: 96_000,
    });
  });

  test('equity equal to internal daily floor allows', () => {
    const c = ctx({ equity: 96_000 });
    const decision = evaluateDailyBreaker(newOrderIntent(), c);

    expect(decision.outcome).toBe('allow');
    expect(decision.detail?.internalDailyFloor).toBe(96_000);
  });

  test('floor formula uses dayStartBalance minus loss fraction of initial balance', () => {
    const c = ctx({
      initialBalance: 100_000,
      dayStartBalance: 98_500,
      equity: 94_499,
      envelopeFloors: {
        internalDailyLossFraction: 0.04,
        internalOverallLossFraction: 0.08,
      },
    });
    const decision = evaluateDailyBreaker(newOrderIntent(), c);

    expect(decision.outcome).toBe('reject');
    expect(decision.detail?.internalDailyFloor).toBe(94_500);
  });

  test('intent shape does not change the decision on healthy or breached envelopes', () => {
    for (const intent of intentShapes()) {
      expect(evaluateDailyBreaker(intent, ctx({ equity: 99_000 })).outcome).toBe('allow');
      expect(evaluateDailyBreaker(intent, ctx({ equity: 95_000 })).outcome).toBe('reject');
    }
  });
});
