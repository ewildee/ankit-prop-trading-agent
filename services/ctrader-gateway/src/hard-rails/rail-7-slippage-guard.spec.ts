// Rail 7 — post-fill slippage guard regression coverage.
// [ANKA-40](/ANKA/issues/ANKA-40) fixes the previous fail-open behaviour
// when rail 7 was reached without a fill report or with a non-NEW intent.
// [ANKA-58](/ANKA/issues/ANKA-58) closes the residual malformed-fill
// fail-open: a fill whose `filledPrice` / `intendedPrice` is missing or
// non-finite must reject (otherwise `Math.abs(NaN) > cap` is `false` and
// the rail allows a just-opened position without ever evaluating the cap).
// Per BLUEPRINT §3.5 ("default for any uncertainty: fail closed") every
// branch must reject so a dispatcher / broker bug cannot leave a
// just-opened position on the books without ever evaluating the slippage cap.

import { describe, expect, test } from 'bun:test';
import { InMemoryIdempotencyStore } from './idempotency-store.ts';
import { captureLogger } from './logger.ts';
import { InMemoryNewsClient } from './news-client.ts';
import { evaluateSlippageGuard } from './rail-7-slippage-guard.ts';
import { InMemoryThrottleStore } from './throttle-store.ts';
import {
  type AmendOrderIntent,
  type BrokerSnapshot,
  type CloseOrderIntent,
  DEFAULT_RAIL_CONFIG,
  type FillReport,
  type NewOrderIntent,
  type RailContext,
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

function newOrderIntent(): NewOrderIntent {
  return {
    kind: 'NEW',
    clientOrderId: 'cid-rail7-new',
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

function amendIntent(): AmendOrderIntent {
  return {
    kind: 'AMEND',
    clientOrderId: 'cid-rail7-amend',
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

function closeIntent(): CloseOrderIntent {
  return {
    kind: 'CLOSE',
    clientOrderId: 'cid-rail7-close',
    accountId: ACCOUNT,
    envelopeId: ENVELOPE,
    symbol: SYMBOL,
    positionId: 'pos-1',
    intendedAtMs: NOW,
  };
}

describe('rail 7 — slippage guard fail-closed defaults (ANKA-40)', () => {
  test('NEW intent without fill report rejects (fail closed) instead of allowing', () => {
    // Pre-fix bug: this branch returned `allow`, so a dispatcher that
    // forwarded a NEW intent into the post-fill path before the broker fill
    // arrived would silently bypass the slippage cap entirely.
    const decision = evaluateSlippageGuard(newOrderIntent(), ctx());

    expect(decision.outcome).toBe('reject');
    expect(decision.rail).toBe('slippage_guard');
    expect(decision.reason).toContain('without fill report');
    expect(decision.reason).toContain('fail closed');
    expect(decision.detail).toMatchObject({ intentKind: 'NEW', hasFill: false });
  });

  test('AMEND intent rejects — rail 7 is post-fill-only', () => {
    const decision = evaluateSlippageGuard(amendIntent(), ctx());

    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toContain('non-NEW intent');
    expect(decision.detail).toMatchObject({ intentKind: 'AMEND', hasFill: false });
  });

  test('CLOSE intent rejects — rail 7 is post-fill-only', () => {
    const decision = evaluateSlippageGuard(closeIntent(), ctx());

    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toContain('non-NEW intent');
    expect(decision.detail).toMatchObject({ intentKind: 'CLOSE', hasFill: false });
  });

  test('non-NEW intent with a stray fill still rejects (kind check wins)', () => {
    // Defence in depth: a malformed snapshot with a fill on AMEND/CLOSE must
    // not be treated as a slippage check. The kind branch is checked first.
    const fill: FillReport = { intendedPrice: 2400, filledPrice: 2400.1 };
    const decision = evaluateSlippageGuard(amendIntent(), ctx({ fill }));

    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toContain('non-NEW intent');
    expect(decision.detail).toMatchObject({ intentKind: 'AMEND', hasFill: true });
  });

  test('NEW intent with fill within cap allows (sanity)', () => {
    // cap = max(2*0.3, 0.5*6) = 3; slippage 0.5 ≤ 3 → allow.
    const fill: FillReport = { intendedPrice: 2400, filledPrice: 2400.5 };
    const decision = evaluateSlippageGuard(newOrderIntent(), ctx({ fill }));

    expect(decision.outcome).toBe('allow');
    expect(decision.detail).toMatchObject({ slippage: 0.5, cap: 3 });
  });

  test('NEW intent with fill above cap rejects (existing close-immediately path)', () => {
    const fill: FillReport = { intendedPrice: 2400, filledPrice: 2405 };
    const decision = evaluateSlippageGuard(newOrderIntent(), ctx({ fill }));

    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toContain('close immediately');
    expect(decision.detail).toMatchObject({ slippage: 5, cap: 3 });
  });
});

describe('rail 7 — slippage guard malformed-fill fail-closed (ANKA-58)', () => {
  // ANKA-58 regression: any defined `broker.fill` was treated as structurally
  // valid, so a missing or non-finite `filledPrice` / `intendedPrice` produced
  // `Math.abs(NaN) > cap === false` and rail 7 returned `allow` on the
  // just-opened position without ever evaluating the cap. BLUEPRINT §3.5
  // requires fail-closed `reject` with an attributable reason here.

  test('NEW intent with fill missing filledPrice rejects with malformed-fill reason', () => {
    const malformedFill = { intendedPrice: 2400 } as unknown as FillReport;
    const decision = evaluateSlippageGuard(newOrderIntent(), ctx({ fill: malformedFill }));

    expect(decision.outcome).toBe('reject');
    expect(decision.rail).toBe('slippage_guard');
    expect(decision.reason).toBe('rail 7 malformed fill report — fail closed');
    expect(decision.detail).toMatchObject({
      intentKind: 'NEW',
      hasFill: true,
      intendedPrice: 2400,
    });
  });

  test('NEW intent with fill missing intendedPrice rejects with malformed-fill reason', () => {
    const malformedFill = { filledPrice: 2400.5 } as unknown as FillReport;
    const decision = evaluateSlippageGuard(newOrderIntent(), ctx({ fill: malformedFill }));

    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toBe('rail 7 malformed fill report — fail closed');
    expect(decision.detail).toMatchObject({
      intentKind: 'NEW',
      hasFill: true,
      filledPrice: 2400.5,
    });
  });

  test('NEW intent with NaN filledPrice rejects with malformed-fill reason', () => {
    const malformedFill: FillReport = { intendedPrice: 2400, filledPrice: Number.NaN };
    const decision = evaluateSlippageGuard(newOrderIntent(), ctx({ fill: malformedFill }));

    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toBe('rail 7 malformed fill report — fail closed');
  });

  test('NEW intent with Infinity intendedPrice rejects with malformed-fill reason', () => {
    const malformedFill: FillReport = {
      intendedPrice: Number.POSITIVE_INFINITY,
      filledPrice: 2400.5,
    };
    const decision = evaluateSlippageGuard(newOrderIntent(), ctx({ fill: malformedFill }));

    expect(decision.outcome).toBe('reject');
    expect(decision.reason).toBe('rail 7 malformed fill report — fail closed');
  });
});
