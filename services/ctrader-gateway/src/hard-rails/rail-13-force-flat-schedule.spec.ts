// Rail 13 — fail-closed when the force-flat schedule is unknown.
// [ANKA-27](/ANKA/issues/ANKA-27) — follow-up to [ANKA-19](/ANKA/issues/ANKA-19)
// REVIEW-FINDINGS B-2 (BLOCKING). BLUEPRINT §3.5 demands fail-closed on
// uncertainty; rail 13 must reject NEW orders if no schedule anchor
// (market_close, friday_close, restricted event) is available. The contract
// surface (`BrokerSnapshot.marketCloseAtMs`) is required at the type level;
// this rail-level guard defends against malformed data slipping past a future
// Zod boundary parser (ANKA-15).

import { describe, expect, test } from 'bun:test';
import { InMemoryIdempotencyStore } from './idempotency-store.ts';
import { captureLogger } from './logger.ts';
import { InMemoryNewsClient } from './news-client.ts';
import { evaluateForceFlatSchedule } from './rail-13-force-flat-schedule.ts';
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

function intent(): NewOrderIntent {
  return {
    kind: 'NEW',
    clientOrderId: '01J0XYZ-RAIL13-FAILCLOSED',
    accountId: 'ftmo-2step-100k-1',
    envelopeId: 'ftmo-2step-#1',
    symbol: 'XAUUSD',
    side: 'BUY',
    volume: 1,
    entryPrice: 2400,
    stopLossPrice: 2399,
    intendedAtMs: NOW,
  };
}

function malformedCtx(): RailContext {
  // Construct a snapshot that bypasses the type-level invariant
  // (`marketCloseAtMs: number`) to exercise rail-13's runtime fail-closed
  // branch. Mirrors the shape a future Zod boundary parser failure could
  // produce if a malformed reconciliation lost its close-time anchors.
  const broker = {
    nowMs: NOW,
    accountId: 'ftmo-2step-100k-1',
    envelopeId: 'ftmo-2step-#1',
    initialBalance: 100_000,
    dayStartBalance: 100_000,
    closedBalance: 100_000,
    equity: 100_000,
    positions: [],
    lastTradeBySymbol: {},
    symbol: symbol(),
    bid: 2400,
    ask: 2400.2,
    phase: 'phase_1' as const,
    profitTarget: { fractionOfInitial: 0.1, bufferDollars: 50, minDaysComplete: false },
    envelopeFloors: {
      internalDailyLossFraction: 0.04,
      internalOverallLossFraction: 0.08,
    },
    defensiveSlMaxLossFraction: 0.005,
    // Intentionally omitted: marketCloseAtMs, fridayCloseAtMs.
  } as unknown as BrokerSnapshot;
  return {
    broker,
    news: new InMemoryNewsClient({ lastSuccessfulFetchAtMs: NOW }), // no events → nextRestrictedEvent === null
    idempotency: new InMemoryIdempotencyStore(),
    throttle: new InMemoryThrottleStore(),
    logger: captureLogger(),
    config: DEFAULT_RAIL_CONFIG,
  };
}

describe('Rail 13 fail-closed (BLUEPRINT §3.5, ANKA-27)', () => {
  test('NEW with all schedule anchors undefined → reject "force-flat schedule unknown — fail-closed"', () => {
    const ctx = malformedCtx();
    const decision = evaluateForceFlatSchedule(intent(), ctx);
    expect(decision.outcome).toBe('reject');
    expect(decision.rail).toBe('force_flat_schedule');
    expect(decision.reason).toBe('force-flat schedule unknown — fail-closed');

    const log = ctx.logger as ReturnType<typeof captureLogger>;
    const events = log.events.filter((e) => e.payload.rail === 'force_flat_schedule');
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev).toBeDefined();
    if (ev === undefined) return;
    expect(ev.level).toBe('warn');
    expect(ev.payload.outcome).toBe('reject');
    expect(ev.payload.reason).toBe('force-flat schedule unknown — fail-closed');
  });

  test('AMEND/CLOSE remain allowed even when schedule anchors are unknown (drain path)', () => {
    // Drain path stays open per BLUEPRINT §11.6 — rail 13 only fail-closes
    // NEW entries because lifecycle ops are never new exposure.
    const ctx = malformedCtx();
    const amend = evaluateForceFlatSchedule(
      {
        kind: 'AMEND',
        clientOrderId: '01J0XYZ-RAIL13-AMEND',
        accountId: 'ftmo-2step-100k-1',
        envelopeId: 'ftmo-2step-#1',
        symbol: 'XAUUSD',
        positionId: 'pos-1',
        side: 'BUY',
        prevStopLossPrice: 2399,
        newStopLossPrice: 2399.5,
        intendedAtMs: NOW,
      },
      ctx,
    );
    expect(amend.outcome).toBe('allow');
  });
});
