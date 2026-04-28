// ANKA-31 (REVIEW-FINDINGS H-5) — rail-computed §11.7 staleness for rails 3+4.
//
// Locks the contract: the NewsClient only surfaces lastSuccessfulFetchAtMs(),
// and the rail layer owns the freshness comparison. A faulty client cannot
// lie about freshness by reporting age=0 after a failed fetch — there is no
// `age` accessor on the contract.

import { describe, expect, test } from 'bun:test';
import { InMemoryIdempotencyStore } from './idempotency-store.ts';
import { captureLogger } from './logger.ts';
import { InMemoryNewsClient } from './news-client.ts';
import {
  evaluateNewsBlackout,
  NEWS_NEVER_FETCHED_REASON,
  NEWS_NON_FINITE_FETCH_REASON,
} from './rail-3-news-blackout.ts';
import { evaluateNewsPreKill } from './rail-4-news-pre-kill.ts';
import { InMemoryThrottleStore } from './throttle-store.ts';
import {
  type BrokerSnapshot,
  DEFAULT_RAIL_CONFIG,
  type NewsClient,
  type RailContext,
  type RailIntent,
  type SymbolMeta,
} from './types.ts';

const NOW = Date.parse('2026-04-27T16:00:00Z');
const SYMBOL = 'XAUUSD';
const ACCOUNT = 'ftmo-2step-100k-1';
const ENVELOPE = 'ftmo-2step-#1';

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

function broker(): BrokerSnapshot {
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
    profitTarget: { fractionOfInitial: 0.1, bufferFraction: 0.01, minDaysComplete: false },
    envelopeFloors: { internalDailyLossFraction: 0.04, internalOverallLossFraction: 0.08 },
    defensiveSlMaxLossFraction: 0.005,
    marketCloseAtMs: NOW + 24 * 60 * 60 * 1000,
  };
}

function intent(): RailIntent {
  return {
    kind: 'NEW',
    clientOrderId: '01J0XYZ-NEWS-STALENESS',
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

function ctx(news: NewsClient): RailContext {
  return {
    broker: broker(),
    news,
    idempotency: new InMemoryIdempotencyStore(),
    throttle: new InMemoryThrottleStore(),
    logger: captureLogger(),
    config: DEFAULT_RAIL_CONFIG,
  };
}

const STALE_MAX = DEFAULT_RAIL_CONFIG.newsStaleMaxMs;

describe('rail 3 + 4 — rail-computed §11.7 staleness (ANKA-31)', () => {
  test('rail 3: lastSuccessfulFetchAtMs() === null → reject (never fetched)', () => {
    const news = new InMemoryNewsClient({ lastSuccessfulFetchAtMs: null });
    const decision = evaluateNewsBlackout(intent(), ctx(news));
    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toBe(NEWS_NEVER_FETCHED_REASON);
    expect(decision.detail).toMatchObject({ lastSuccessfulFetchAtMs: null });
  });

  test('rail 4: lastSuccessfulFetchAtMs() === null → reject (never fetched)', () => {
    const news = new InMemoryNewsClient({ lastSuccessfulFetchAtMs: null });
    const decision = evaluateNewsPreKill(intent(), ctx(news));
    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toBe(NEWS_NEVER_FETCHED_REASON);
    expect(decision.detail).toMatchObject({ lastSuccessfulFetchAtMs: null });
  });

  test('rail 3: ageMs > newsStaleMaxMs → reject (stale)', () => {
    // Last successful fetch was (staleMax + 1s) ago.
    const lastFetch = NOW - STALE_MAX - 1000;
    const news = new InMemoryNewsClient({ lastSuccessfulFetchAtMs: lastFetch });
    const decision = evaluateNewsBlackout(intent(), ctx(news));
    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toContain('news stale');
    expect(decision.reason).toContain('fail-closed');
    expect(decision.detail).toMatchObject({
      lastSuccessfulFetchAtMs: lastFetch,
      ageMs: STALE_MAX + 1000,
      newsStaleMaxMs: STALE_MAX,
    });
  });

  test('rail 4: ageMs > newsStaleMaxMs → reject (stale)', () => {
    const lastFetch = NOW - STALE_MAX - 1000;
    const news = new InMemoryNewsClient({ lastSuccessfulFetchAtMs: lastFetch });
    const decision = evaluateNewsPreKill(intent(), ctx(news));
    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toContain('news stale');
    expect(decision.reason).toContain('fail-closed');
    expect(decision.detail).toMatchObject({
      lastSuccessfulFetchAtMs: lastFetch,
      ageMs: STALE_MAX + 1000,
      newsStaleMaxMs: STALE_MAX,
    });
  });

  test('rail 3: ageMs === newsStaleMaxMs → allow (boundary, not strictly greater)', () => {
    // Exactly at the threshold passes — strict `>` matches the rail comparison.
    const lastFetch = NOW - STALE_MAX;
    const news = new InMemoryNewsClient({ lastSuccessfulFetchAtMs: lastFetch });
    const decision = evaluateNewsBlackout(intent(), ctx(news));
    expect(decision.outcome).toBe('allow');
    expect(decision.detail).toMatchObject({ ageMs: STALE_MAX });
  });

  test('rail 4: ageMs === newsStaleMaxMs → allow (boundary, not strictly greater)', () => {
    const lastFetch = NOW - STALE_MAX;
    const news = new InMemoryNewsClient({ lastSuccessfulFetchAtMs: lastFetch });
    const decision = evaluateNewsPreKill(intent(), ctx(news));
    expect(decision.outcome).toBe('allow');
    expect(decision.detail).toMatchObject({ ageMs: STALE_MAX });
  });

  test('rail 3: client lying about freshness (lastSuccessfulFetchAtMs in the future) rejects', () => {
    const lastFetch = NOW + 60_000; // 60 s in the future
    const news = new InMemoryNewsClient({ lastSuccessfulFetchAtMs: lastFetch });
    const decision = evaluateNewsBlackout(intent(), ctx(news));
    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toContain('news future-timestamp');
    expect(decision.reason).toContain('fail-closed');
    expect(decision.detail).toMatchObject({
      lastSuccessfulFetchAtMs: lastFetch,
      nowMs: NOW,
      newsStaleMaxMs: STALE_MAX,
    });
  });

  test('rail 4: client lying about freshness (lastSuccessfulFetchAtMs in the future) rejects', () => {
    const lastFetch = NOW + 60_000; // 60 s in the future
    const news = new InMemoryNewsClient({ lastSuccessfulFetchAtMs: lastFetch });
    const decision = evaluateNewsPreKill(intent(), ctx(news));
    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toContain('news future-timestamp');
    expect(decision.reason).toContain('fail-closed');
    expect(decision.detail).toMatchObject({
      lastSuccessfulFetchAtMs: lastFetch,
      nowMs: NOW,
      newsStaleMaxMs: STALE_MAX,
    });
  });

  for (const [label, lastFetch] of [
    ['NaN', Number.NaN],
    ['+Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ] as const) {
    test(`rail 3: ${label} lastSuccessfulFetchAtMs rejects`, () => {
      const news = new InMemoryNewsClient({ lastSuccessfulFetchAtMs: lastFetch });
      const decision = evaluateNewsBlackout(intent(), ctx(news));
      expect(decision.outcome).toBe('reject');
      expect(decision.reason).toBe(NEWS_NON_FINITE_FETCH_REASON);
      expect(decision.reason).toContain('fail-closed');
      expect(decision.detail).toMatchObject({
        lastSuccessfulFetchAtMs: lastFetch,
        nowMs: NOW,
        newsStaleMaxMs: STALE_MAX,
      });
    });

    test(`rail 4: ${label} lastSuccessfulFetchAtMs rejects`, () => {
      const news = new InMemoryNewsClient({ lastSuccessfulFetchAtMs: lastFetch });
      const decision = evaluateNewsPreKill(intent(), ctx(news));
      expect(decision.outcome).toBe('reject');
      expect(decision.reason).toBe(NEWS_NON_FINITE_FETCH_REASON);
      expect(decision.reason).toContain('fail-closed');
      expect(decision.detail).toMatchObject({
        lastSuccessfulFetchAtMs: lastFetch,
        nowMs: NOW,
        newsStaleMaxMs: STALE_MAX,
      });
    });
  }

  test('rail 4: omitted lastSuccessfulFetchAtMs without clock fails closed on fixture sentinel', () => {
    const news = new InMemoryNewsClient(); // no events, no fetch override
    const decision = evaluateNewsPreKill(intent(), ctx(news));
    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toContain('news future-timestamp');
    expect(decision.reason).toContain('fail-closed');
    expect(decision.detail).toMatchObject({
      lastSuccessfulFetchAtMs: Number.MAX_SAFE_INTEGER,
      nowMs: NOW,
      newsStaleMaxMs: STALE_MAX,
    });
  });

  test('rail 4: omitted lastSuccessfulFetchAtMs with clock uses fresh-now fixture', () => {
    const news = new InMemoryNewsClient({ nowMs: () => NOW });
    const decision = evaluateNewsPreKill(intent(), ctx(news));
    expect(decision.outcome).toBe('allow');
    expect(decision.reason).toBe('no tier-1 event within 2h');
    expect(decision.detail).toMatchObject({ lastSuccessfulFetchAtMs: NOW, ageMs: 0 });
  });
});
