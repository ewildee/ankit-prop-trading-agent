// Rail 10 contract lock — BLUEPRINT §8.2 / §8.4 decision N: the profit-target
// trip threshold is `closed_balance ≥ INITIAL × (1 + target + buffer)` where
// both `target` and `buffer` are fractions of INITIAL_CAPITAL. ANKA-26 fixes
// the previous flat-dollar drift; these tests pin the boundary so it cannot
// regress silently.

import { describe, expect, test } from 'bun:test';
import { InMemoryIdempotencyStore } from './idempotency-store.ts';
import { captureLogger } from './logger.ts';
import { InMemoryNewsClient } from './news-client.ts';
import { evaluatePhaseProfitTarget } from './rail-10-phase-profit-target.ts';
import { InMemoryThrottleStore } from './throttle-store.ts';
import {
  type BrokerSnapshot,
  DEFAULT_RAIL_CONFIG,
  type NewOrderIntent,
  type ProfitTarget,
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

function ctx(overrides: { closedBalance: number; profitTarget: ProfitTarget }): RailContext {
  const broker: BrokerSnapshot = {
    nowMs: NOW,
    accountId: 'a',
    envelopeId: 'e',
    initialBalance: 100_000,
    dayStartBalance: 100_000,
    closedBalance: overrides.closedBalance,
    equity: overrides.closedBalance,
    positions: [],
    lastTradeBySymbol: {},
    symbol: symbol(),
    bid: 2400,
    ask: 2400.2,
    phase: 'phase_1',
    profitTarget: overrides.profitTarget,
    envelopeFloors: { internalDailyLossFraction: 0.04, internalOverallLossFraction: 0.08 },
    defensiveSlMaxLossFraction: 0.005,
    marketCloseAtMs: NOW + 24 * 60 * 60 * 1000,
  };
  return {
    broker,
    news: new InMemoryNewsClient({ lastSuccessfulFetchAtMs: NOW }),
    idempotency: new InMemoryIdempotencyStore(),
    throttle: new InMemoryThrottleStore(),
    logger: captureLogger(),
    config: DEFAULT_RAIL_CONFIG,
  };
}

const FRESH_INTENT: NewOrderIntent = {
  kind: 'NEW',
  clientOrderId: 'cid-rail10',
  accountId: 'a',
  envelopeId: 'e',
  symbol: 'XAUUSD',
  side: 'BUY',
  volume: 1,
  entryPrice: 2400,
  stopLossPrice: 2399,
  intendedAtMs: NOW,
};

describe('rail 10 — profit-target buffer is a fraction of INITIAL_CAPITAL', () => {
  // §8.2 default: target=10%, buffer=+1.0% ⇒ trips at closed_balance ≥ 111_000
  // on a $100k account. The earlier flat-$50 implementation tripped at $110_050.
  const profitTarget: ProfitTarget = {
    fractionOfInitial: 0.1,
    bufferFraction: 0.01,
    minDaysComplete: true,
  };

  // Computed in-test so the boundary survives the unavoidable FP imprecision of
  // (1 + 0.1 + 0.01) ≈ 1.1100000000000003. The contract is "trip at or above
  // initial × (1 + target + buffer)", whatever exact value JS arithmetic yields.
  const INITIAL = 100_000;
  const target = INITIAL * (1 + profitTarget.fractionOfInitial + profitTarget.bufferFraction);

  test('rejects exactly at INITIAL × (1 + target + buffer)', () => {
    const decision = evaluatePhaseProfitTarget(
      FRESH_INTENT,
      ctx({ closedBalance: target, profitTarget }),
    );
    expect(decision.outcome).toBe('reject');
  });

  test('allows one cent below boundary', () => {
    const decision = evaluatePhaseProfitTarget(
      FRESH_INTENT,
      ctx({ closedBalance: target - 0.01, profitTarget }),
    );
    expect(decision.outcome).toBe('allow');
  });

  test('allows at the old flat-dollar threshold (regression: would have tripped early)', () => {
    // Pre-fix code would trip at 100_000 × 1.10 + 50 = 110_050. New contract
    // must NOT trip there because 110_050 < 111_000.
    const decision = evaluatePhaseProfitTarget(
      FRESH_INTENT,
      ctx({ closedBalance: 110_050, profitTarget }),
    );
    expect(decision.outcome).toBe('allow');
  });

  test('targetHit but min-days incomplete still allows', () => {
    const decision = evaluatePhaseProfitTarget(
      FRESH_INTENT,
      ctx({
        closedBalance: 111_500,
        profitTarget: { ...profitTarget, minDaysComplete: false },
      }),
    );
    expect(decision.outcome).toBe('allow');
  });

  test('rejects bufferFraction outside [0, 0.5] (fail-closed runtime guard)', () => {
    expect(() =>
      evaluatePhaseProfitTarget(
        FRESH_INTENT,
        ctx({
          closedBalance: 111_000,
          profitTarget: { fractionOfInitial: 0.1, bufferFraction: 0.6, minDaysComplete: true },
        }),
      ),
    ).toThrow(/bufferFraction/);

    expect(() =>
      evaluatePhaseProfitTarget(
        FRESH_INTENT,
        ctx({
          closedBalance: 111_000,
          profitTarget: { fractionOfInitial: 0.1, bufferFraction: -0.01, minDaysComplete: true },
        }),
      ),
    ).toThrow(/bufferFraction/);
  });
});
