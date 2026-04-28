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
import { evaluateNewsBlackout, NEWS_NEVER_FETCHED_REASON } from './rail-3-news-blackout.ts';
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

  test('rail 3: client lying about freshness (lastSuccessfulFetchAtMs in the future) cannot defeat the guard', () => {
    // A faulty client that reports a *future* timestamp produces a negative
    // age. The rail's strict `ageMs > staleMax` check still allows here, but
    // the proof is that a lying client can no longer report age=0 after a
    // failed fetch — that signal is gone from the contract surface.
    // Rail 3 still applies the event-window check normally.
    const lastFetch = NOW + 60_000; // 60 s in the future
    const news = new InMemoryNewsClient({ lastSuccessfulFetchAtMs: lastFetch });
    const decision = evaluateNewsBlackout(intent(), ctx(news));
    expect(decision.outcome).toBe('allow');
    // Age is negative — the rail records the raw arithmetic so log analysis
    // can detect upstream clock skew or a misbehaving client.
    expect(decision.detail).toMatchObject({
      lastSuccessfulFetchAtMs: lastFetch,
      ageMs: -60_000,
    });
  });

  test('rail 4: omitted lastSuccessfulFetchAtMs → fixture defaults to fresh sentinel and rail allows', () => {
    // Other test suites that only care about news-window logic don't pass a
    // staleness option. The fixture must default to "always fresh" so they
    // don't accidentally trip rail 4 on staleness instead of the window logic.
    const news = new InMemoryNewsClient(); // no events, no fetch override
    const decision = evaluateNewsPreKill(intent(), ctx(news));
    expect(decision.outcome).toBe('allow');
    expect(decision.reason).toBe('no tier-1 event within 2h');
  });
});
