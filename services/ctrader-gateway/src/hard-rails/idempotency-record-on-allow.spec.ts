// Rail 9 idempotency record-on-non-reject regression (ANKA-28 / ANKA-19 H-1).
// `idempotency.record(...)` lives in `evaluatePreSubmitRails`, not in the rail
// itself. A composite verdict that ends in `reject` (rails 10..14 vote down
// after rail 9 already allowed) must NOT consume the ULID, so an operator
// retry of the same `clientOrderId` after the breaker clears succeeds rail 9.

import { describe, expect, test } from 'bun:test';
import { evaluatePreSubmitRails } from './evaluator.ts';
import { InMemoryIdempotencyStore } from './idempotency-store.ts';
import { silentLogger } from './logger.ts';
import { InMemoryNewsClient } from './news-client.ts';
import { InMemoryThrottleStore } from './throttle-store.ts';
import {
  type BrokerSnapshot,
  DEFAULT_RAIL_CONFIG,
  type RailConfig,
  type RailContext,
  type RailIntent,
  type SymbolMeta,
} from './types.ts';

const NOW = Date.parse('2026-04-27T16:00:00Z');
const SYMBOL = 'XAUUSD';
const ACCOUNT = 'ftmo-2step-100k-1';
const ENVELOPE = 'ftmo-2step-#1';
const CID = '01J0XYZ-RETRY-OK';

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
  return {
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
    bid: 2400.0,
    ask: 2400.2,
    phase: 'phase_1',
    // bufferFraction is rail 10's runtime contract (BLUEPRINT §8.4 in-flight
    // rename); bufferDollars stays for the current types.ts surface so the
    // shape compiles either way during the partial migration.
    profitTarget: {
      fractionOfInitial: 0.1,
      bufferDollars: 50,
      bufferFraction: 0.01,
      minDaysComplete: false,
    } as BrokerSnapshot['profitTarget'],
    envelopeFloors: {
      internalDailyLossFraction: 0.04,
      internalOverallLossFraction: 0.08,
    },
    defensiveSlMaxLossFraction: 0.005,
    // Rail 13 fail-closes on missing schedule anchors. Default to a market
    // close 24h out so it stays out of the lead-min window unless overridden.
    marketCloseAtMs: NOW + 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

function intent(overrides: Partial<RailIntent> = {}): RailIntent {
  return {
    kind: 'NEW',
    clientOrderId: CID,
    accountId: ACCOUNT,
    envelopeId: ENVELOPE,
    symbol: SYMBOL,
    side: 'BUY',
    volume: 1,
    entryPrice: 2400,
    stopLossPrice: 2399,
    intendedAtMs: NOW,
    ...overrides,
  } as RailIntent;
}

function makeCtx(overrides: {
  broker?: Partial<BrokerSnapshot>;
  idempotency?: InMemoryIdempotencyStore;
  throttle?: InMemoryThrottleStore;
  config?: Partial<RailConfig>;
}): RailContext {
  const b = broker(overrides.broker ?? {});
  return {
    broker: b,
    news: new InMemoryNewsClient({ events: [] }),
    idempotency: overrides.idempotency ?? new InMemoryIdempotencyStore(),
    throttle: overrides.throttle ?? new InMemoryThrottleStore(),
    logger: silentLogger,
    config: { ...DEFAULT_RAIL_CONFIG, ...(overrides.config ?? {}) },
  };
}

describe('rail 9 idempotency — record only on non-reject composite verdict', () => {
  test('rail 12 reject does NOT consume idempotency; same clientOrderId retry succeeds rail 9', () => {
    const idempotency = new InMemoryIdempotencyStore();
    const throttle = new InMemoryThrottleStore();
    // Drain the bucket at NOW so rail 12 will reject the first attempt.
    for (let i = 0; i < DEFAULT_RAIL_CONFIG.throttleCapacity; i++) {
      throttle.consume({
        accountId: ACCOUNT,
        atMs: NOW,
        capacity: DEFAULT_RAIL_CONFIG.throttleCapacity,
        windowMs: DEFAULT_RAIL_CONFIG.throttleWindowMs,
      });
    }

    // Attempt #1: rail 12 rejects; rail 9 allowed but must NOT have recorded.
    const v1 = evaluatePreSubmitRails(intent(), makeCtx({ idempotency, throttle }));
    expect(v1.outcome).toBe('reject');
    const tripped1 = v1.decisions.find((d) => d.outcome === 'reject');
    expect(tripped1?.rail).toBe('ea_throttle');
    expect(idempotency.has(CID)).toBe(false);

    // Attempt #2: bucket fully refilled (one full window later); same ULID
    // must pass rail 9 and the whole composite must allow. Push the market
    // close anchor forward so rail 13 doesn't trip on the retry timestamp.
    const later = NOW + DEFAULT_RAIL_CONFIG.throttleWindowMs;
    const v2 = evaluatePreSubmitRails(
      intent({ intendedAtMs: later }),
      makeCtx({
        broker: { nowMs: later, marketCloseAtMs: later + 24 * 60 * 60 * 1000 },
        idempotency,
        throttle,
      }),
    );
    expect(v2.outcome).toBe('allow');
    const rail9 = v2.decisions.find((d) => d.rail === 'idempotency');
    expect(rail9?.outcome).toBe('allow');
    expect(idempotency.has(CID)).toBe(true);
  });

  test('rail 13 reject does NOT consume idempotency; same clientOrderId retry succeeds rail 9', () => {
    const idempotency = new InMemoryIdempotencyStore();

    // Attempt #1: market close 3 minutes ahead → inside the 5-min force-flat
    // window → rail 13 rejects. Rail 9 ran first and allowed.
    const v1 = evaluatePreSubmitRails(
      intent(),
      makeCtx({ broker: { marketCloseAtMs: NOW + 3 * 60 * 1000 }, idempotency }),
    );
    expect(v1.outcome).toBe('reject');
    const tripped1 = v1.decisions.find((d) => d.outcome === 'reject');
    expect(tripped1?.rail).toBe('force_flat_schedule');
    expect(idempotency.has(CID)).toBe(false);

    // Attempt #2: market close pushed beyond the lead-min window; same ULID
    // must pass rail 9 and the whole composite must allow.
    const later = NOW + 30 * 60 * 1000;
    const v2 = evaluatePreSubmitRails(
      intent({ intendedAtMs: later }),
      makeCtx({
        broker: { nowMs: later, marketCloseAtMs: later + 60 * 60 * 1000 },
        idempotency,
      }),
    );
    expect(v2.outcome).toBe('allow');
    const rail9 = v2.decisions.find((d) => d.rail === 'idempotency');
    expect(rail9?.outcome).toBe('allow');
    expect(idempotency.has(CID)).toBe(true);
  });

  test('a fully-allowed verdict records the ULID; the immediate replay rejects on rail 9', () => {
    const idempotency = new InMemoryIdempotencyStore();

    const v1 = evaluatePreSubmitRails(intent(), makeCtx({ idempotency }));
    expect(v1.outcome).toBe('allow');
    expect(idempotency.has(CID)).toBe(true);

    const v2 = evaluatePreSubmitRails(intent(), makeCtx({ idempotency }));
    expect(v2.outcome).toBe('reject');
    const tripped = v2.decisions.find((d) => d.outcome === 'reject');
    expect(tripped?.rail).toBe('idempotency');
  });

  test('a tighten verdict (rail 11) still records the ULID', () => {
    const idempotency = new InMemoryIdempotencyStore();

    // From matrix.spec.ts case 11-positive: SL distance 10 → tightened to 5.
    const v = evaluatePreSubmitRails(
      intent({ entryPrice: 2400, stopLossPrice: 2390 }),
      makeCtx({ idempotency }),
    );
    expect(v.outcome).toBe('tighten');
    expect(idempotency.has(CID)).toBe(true);
  });
});
