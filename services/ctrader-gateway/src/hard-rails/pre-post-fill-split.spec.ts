// Pre-submit / post-fill split (ANKA-29 / ANKA-19 H-2).
//
// `evaluatePreSubmitRails` runs rails 1–6, 8–14 and (on a non-reject verdict)
// records the ULID into the idempotency registry. `evaluatePostFillRails`
// runs rail 7 only and has zero side-effects on idempotency or throttle.
// The dispatcher invariant: a single `clientOrderId` traverses pre-submit
// once, then post-fill once. Re-running the full chain (the old
// `evaluateAllRails`) on the post-fill phase would double-record idempotency
// and burn another throttle token — the H-2 bug this split fixes.

import { describe, expect, test } from 'bun:test';
import {
  evaluatePostFillRails,
  evaluatePreSubmitRails,
  POST_FILL_RAIL_KEYS,
  PRE_SUBMIT_RAIL_KEYS,
} from './evaluator.ts';
import { InMemoryIdempotencyStore } from './idempotency-store.ts';
import { silentLogger } from './logger.ts';
import { InMemoryNewsClient } from './news-client.ts';
import { InMemoryThrottleStore } from './throttle-store.ts';
import {
  type BrokerSnapshot,
  DEFAULT_RAIL_CONFIG,
  type FillReport,
  type RailConfig,
  type RailContext,
  type RailIntent,
  type SymbolMeta,
} from './types.ts';

const NOW = Date.parse('2026-04-27T16:00:00Z');
const SYMBOL = 'XAUUSD';
const ACCOUNT = 'ftmo-2step-100k-1';
const ENVELOPE = 'ftmo-2step-#1';
const CID = '01J0XYZ-SPLIT-001';

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
  return {
    broker: broker(overrides.broker ?? {}),
    news: new InMemoryNewsClient({ events: [], lastSuccessfulFetchAtMs: NOW }),
    idempotency: overrides.idempotency ?? new InMemoryIdempotencyStore(),
    throttle: overrides.throttle ?? new InMemoryThrottleStore(),
    logger: silentLogger,
    config: { ...DEFAULT_RAIL_CONFIG, ...(overrides.config ?? {}) },
  };
}

describe('pre-submit / post-fill rail split (ANKA-29)', () => {
  test('catalogs partition cleanly: pre = 13 rails (no slippage), post = [slippage_guard]', () => {
    expect(PRE_SUBMIT_RAIL_KEYS).toHaveLength(13);
    expect(PRE_SUBMIT_RAIL_KEYS).not.toContain('slippage_guard');
    expect(POST_FILL_RAIL_KEYS).toEqual(['slippage_guard']);
    const overlap = PRE_SUBMIT_RAIL_KEYS.filter((k) =>
      (POST_FILL_RAIL_KEYS as readonly string[]).includes(k),
    );
    expect(overlap).toEqual([]);
  });

  test('pre-submit records idempotency once; post-fill does NOT consume rail 9', () => {
    const idempotency = new InMemoryIdempotencyStore();
    const pre = evaluatePreSubmitRails(intent(), makeCtx({ idempotency }));
    expect(pre.outcome).toBe('allow');
    expect(idempotency.has(CID)).toBe(true);

    // Broker reports a fill within the slippage cap. Re-running the full
    // chain here (the old `evaluateAllRails` behaviour) would re-evaluate
    // rail 9 against the now-recorded ULID and reject. The new post-fill
    // path returns the rail-7 verdict only.
    const fill: FillReport = { intendedPrice: 2400, filledPrice: 2400.5 };
    const post = evaluatePostFillRails(intent(), makeCtx({ idempotency, broker: { fill } }));
    expect(post.outcome).toBe('allow');
    expect(post.decisions).toHaveLength(1);
    expect(post.decisions[0]?.rail).toBe('slippage_guard');
    expect(idempotency.has(CID)).toBe(true);
  });

  test('post-fill does NOT consume a throttle token', () => {
    const throttle = new InMemoryThrottleStore();
    const idempotency = new InMemoryIdempotencyStore();

    // Pre-submit consumes 1 token (rail 12).
    const pre = evaluatePreSubmitRails(intent(), makeCtx({ idempotency, throttle }));
    expect(pre.outcome).toBe('allow');

    // Probe consumes a 2nd token; remaining = capacity − 2 confirms exactly
    // one prior consumption.
    const afterPre = throttle.consume({
      accountId: ACCOUNT,
      atMs: NOW,
      capacity: DEFAULT_RAIL_CONFIG.throttleCapacity,
      windowMs: DEFAULT_RAIL_CONFIG.throttleWindowMs,
    });
    expect(afterPre.remaining).toBe(DEFAULT_RAIL_CONFIG.throttleCapacity - 2);

    // Run post-fill. If it (incorrectly) re-ran rail 12, the next probe
    // would see capacity − 4. Asserting capacity − 3 confirms post-fill is
    // throttle-side-effect-free.
    const fill: FillReport = { intendedPrice: 2400, filledPrice: 2400.5 };
    const post = evaluatePostFillRails(
      intent(),
      makeCtx({ idempotency, throttle, broker: { fill } }),
    );
    expect(post.outcome).toBe('allow');

    const afterPost = throttle.consume({
      accountId: ACCOUNT,
      atMs: NOW,
      capacity: DEFAULT_RAIL_CONFIG.throttleCapacity,
      windowMs: DEFAULT_RAIL_CONFIG.throttleWindowMs,
    });
    expect(afterPost.remaining).toBe(DEFAULT_RAIL_CONFIG.throttleCapacity - 3);
  });

  test('post-fill rejects on out-of-cap slippage and emits exactly one rail-7 decision', () => {
    const idempotency = new InMemoryIdempotencyStore();
    const throttle = new InMemoryThrottleStore();

    const pre = evaluatePreSubmitRails(intent(), makeCtx({ idempotency, throttle }));
    expect(pre.outcome).toBe('allow');

    // cap = max(2*0.3, 0.5*6) = 3; slippage 5 > 3 → reject (close-immediately).
    const fill: FillReport = { intendedPrice: 2400, filledPrice: 2405 };
    const post = evaluatePostFillRails(
      intent(),
      makeCtx({ idempotency, throttle, broker: { fill } }),
    );
    expect(post.outcome).toBe('reject');
    expect(post.decisions).toHaveLength(1);
    expect(post.decisions[0]?.rail).toBe('slippage_guard');
    expect(post.decisions[0]?.outcome).toBe('reject');
  });

  test('post-fill without broker fill rejects fail-closed and emits exactly one rail-7 decision', () => {
    const idempotency = new InMemoryIdempotencyStore();
    const throttle = new InMemoryThrottleStore();

    const pre = evaluatePreSubmitRails(intent(), makeCtx({ idempotency, throttle }));
    expect(pre.outcome).toBe('allow');

    const post = evaluatePostFillRails(intent(), makeCtx({ idempotency, throttle }));
    expect(post.outcome).toBe('reject');
    expect(post.decisions).toHaveLength(1);
    expect(post.decisions[0]?.rail).toBe('slippage_guard');
    expect(post.decisions[0]?.outcome).toBe('reject');
    expect(post.decisions[0]?.reason).toContain('without fill report');
    expect(post.decisions[0]?.detail).toMatchObject({ intentKind: 'NEW', hasFill: false });
  });
});
