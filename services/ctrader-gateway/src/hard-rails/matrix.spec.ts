// Rail matrix — BLUEPRINT §9 acceptance for ANKA-14.
// 28 cases (14 × {positive: rail trips, negative: rail allows}). Each case
// asserts the per-rail outcome AND that the structured Pino payload carries
// `rail`, `symbol`, `outcome`, `reason`.

import { describe, expect, test } from 'bun:test';
import { HARD_RAIL_KEYS, type HardRailKey, type RailOutcome } from '@ankit-prop/contracts';
import { RAIL_EVALUATORS } from './evaluator.ts';
import { InMemoryIdempotencyStore } from './idempotency-store.ts';
import { captureLogger } from './logger.ts';
import { InMemoryNewsClient, type NewsEvent } from './news-client.ts';
import { InMemoryThrottleStore } from './throttle-store.ts';
import {
  type BrokerSnapshot,
  DEFAULT_RAIL_CONFIG,
  type IdempotencyStore,
  type RailConfig,
  type RailContext,
  type RailIntent,
  type SymbolMeta,
  type ThrottleStore,
} from './types.ts';

const NOW = Date.parse('2026-04-27T16:00:00Z');
const SYMBOL = 'XAUUSD';
const ACCOUNT = 'ftmo-2step-100k-1';
const ENVELOPE = 'ftmo-2step-#1';

function defaultSymbol(): SymbolMeta {
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

function defaultBroker(overrides: Partial<BrokerSnapshot> = {}): BrokerSnapshot {
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
    symbol: defaultSymbol(),
    bid: 2400.0,
    ask: 2400.2,
    phase: 'phase_1',
    profitTarget: { fractionOfInitial: 0.1, bufferFraction: 0.01, minDaysComplete: false },
    envelopeFloors: {
      internalDailyLossFraction: 0.04,
      internalOverallLossFraction: 0.08,
    },
    defensiveSlMaxLossFraction: 0.005,
    // BLUEPRINT §3.5 — marketCloseAtMs is contractually required (ANKA-27).
    // 24h ahead so non-rail-13 cases never trip the force-flat lead window.
    marketCloseAtMs: NOW + 24 * 60 * 60 * 1000,
  };
  return { ...base, ...overrides };
}

function defaultIntent(overrides: Partial<NonNullable<RailIntent>> = {}): RailIntent {
  const base: RailIntent = {
    kind: 'NEW',
    clientOrderId: '01J0XYZ-NEW-001',
    accountId: ACCOUNT,
    envelopeId: ENVELOPE,
    symbol: SYMBOL,
    side: 'BUY',
    volume: 1,
    entryPrice: 2400,
    stopLossPrice: 2399,
    intendedAtMs: NOW,
  };
  return { ...base, ...overrides } as RailIntent;
}

interface BuiltCase {
  intent: RailIntent;
  ctx: RailContext;
}

interface MatrixCase {
  rail: HardRailKey;
  scenario: 'positive' | 'negative';
  expected: RailOutcome;
  description: string;
  build: () => BuiltCase;
}

function buildCtx(overrides: {
  broker?: Partial<BrokerSnapshot>;
  events?: readonly NewsEvent[];
  newsLastSuccessfulFetchAtMs?: number | null;
  idempotency?: IdempotencyStore;
  throttle?: ThrottleStore;
  config?: Partial<RailConfig>;
}): RailContext {
  const broker = defaultBroker(overrides.broker ?? {});
  const news = new InMemoryNewsClient(
    overrides.newsLastSuccessfulFetchAtMs !== undefined
      ? {
          events: overrides.events ?? [],
          lastSuccessfulFetchAtMs: overrides.newsLastSuccessfulFetchAtMs,
        }
      : { events: overrides.events ?? [] },
  );
  const idempotency = overrides.idempotency ?? new InMemoryIdempotencyStore();
  const throttle = overrides.throttle ?? new InMemoryThrottleStore();
  const config: RailConfig = { ...DEFAULT_RAIL_CONFIG, ...(overrides.config ?? {}) };
  return {
    broker,
    news,
    idempotency,
    throttle,
    logger: captureLogger(),
    config,
  };
}

const CASES: MatrixCase[] = [
  // 1 — daily_breaker
  {
    rail: 'daily_breaker',
    scenario: 'positive',
    expected: 'reject',
    description: 'equity below internal-daily-floor (4% of INITIAL)',
    build: () => ({
      intent: defaultIntent(),
      ctx: buildCtx({ broker: { equity: 95_000 } }),
    }),
  },
  {
    rail: 'daily_breaker',
    scenario: 'negative',
    expected: 'allow',
    description: 'equity above internal-daily-floor',
    build: () => ({
      intent: defaultIntent(),
      ctx: buildCtx({ broker: { equity: 99_000 } }),
    }),
  },
  // 2 — overall_breaker
  {
    rail: 'overall_breaker',
    scenario: 'positive',
    expected: 'reject',
    description: 'equity below 92% of INITIAL_CAPITAL',
    build: () => ({
      intent: defaultIntent(),
      ctx: buildCtx({ broker: { equity: 91_000, dayStartBalance: 91_500 } }),
    }),
  },
  {
    rail: 'overall_breaker',
    scenario: 'negative',
    expected: 'allow',
    description: 'equity above 92% of INITIAL_CAPITAL',
    build: () => ({
      intent: defaultIntent(),
      ctx: buildCtx({ broker: { equity: 99_000 } }),
    }),
  },
  // 3 — news_blackout_5m
  {
    rail: 'news_blackout_5m',
    scenario: 'positive',
    expected: 'reject',
    description: 'NEW within ±5-min restricted-event window',
    build: () => ({
      intent: defaultIntent(),
      ctx: buildCtx({
        events: [{ atMs: NOW + 2 * 60 * 1000, symbol: SYMBOL, impact: 'high', restriction: true }],
      }),
    }),
  },
  {
    rail: 'news_blackout_5m',
    scenario: 'negative',
    expected: 'allow',
    description: 'no restricted event nearby',
    build: () => ({ intent: defaultIntent(), ctx: buildCtx({}) }),
  },
  // 4 — news_pre_kill_2h
  {
    rail: 'news_pre_kill_2h',
    scenario: 'positive',
    expected: 'reject',
    description: 'NEW within 2h of tier-1 event',
    build: () => ({
      intent: defaultIntent(),
      ctx: buildCtx({
        // Place the event 90 minutes ahead AND outside ±5m so only rail 4 trips.
        events: [
          { atMs: NOW + 90 * 60 * 1000, symbol: SYMBOL, impact: 'high', restriction: false },
        ],
      }),
    }),
  },
  {
    rail: 'news_pre_kill_2h',
    scenario: 'negative',
    expected: 'allow',
    description: 'no tier-1 event within 2h',
    build: () => ({ intent: defaultIntent(), ctx: buildCtx({}) }),
  },
  // 5 — min_hold_60s
  {
    rail: 'min_hold_60s',
    scenario: 'positive',
    expected: 'reject',
    description: 'previous trade closed 30s ago',
    build: () => ({
      intent: defaultIntent(),
      ctx: buildCtx({
        broker: { lastTradeBySymbol: { [SYMBOL]: { closedAtMs: NOW - 30 * 1000 } } },
      }),
    }),
  },
  {
    rail: 'min_hold_60s',
    scenario: 'negative',
    expected: 'allow',
    description: 'previous trade closed 90s ago',
    build: () => ({
      intent: defaultIntent(),
      ctx: buildCtx({
        broker: { lastTradeBySymbol: { [SYMBOL]: { closedAtMs: NOW - 90 * 1000 } } },
      }),
    }),
  },
  // 6 — spread_guard
  {
    rail: 'spread_guard',
    scenario: 'positive',
    expected: 'reject',
    description: 'spread > typical × multiplier',
    build: () => ({
      intent: defaultIntent(),
      ctx: buildCtx({ broker: { bid: 2400, ask: 2401.5 } }), // spread 1.5 > 0.9
    }),
  },
  {
    rail: 'spread_guard',
    scenario: 'negative',
    expected: 'allow',
    description: 'spread within typical × multiplier',
    build: () => ({
      intent: defaultIntent(),
      ctx: buildCtx({ broker: { bid: 2400, ask: 2400.4 } }), // 0.4 < 0.9
    }),
  },
  // 7 — slippage_guard
  {
    rail: 'slippage_guard',
    scenario: 'positive',
    expected: 'reject',
    description: 'post-fill slippage > max(2×spread, 0.5×ATR)',
    build: () => ({
      intent: defaultIntent(),
      // cap = max(2*0.3, 0.5*6) = 3; slippage 5 > 3
      ctx: buildCtx({ broker: { fill: { intendedPrice: 2400, filledPrice: 2405 } } }),
    }),
  },
  {
    rail: 'slippage_guard',
    scenario: 'negative',
    expected: 'allow',
    description: 'fill within cap',
    build: () => ({
      intent: defaultIntent(),
      ctx: buildCtx({ broker: { fill: { intendedPrice: 2400, filledPrice: 2401 } } }),
    }),
  },
  // 8 — symbol_whitelist
  {
    rail: 'symbol_whitelist',
    scenario: 'positive',
    expected: 'reject',
    description: 'symbol disabled in whitelist',
    build: () => ({
      intent: defaultIntent(),
      ctx: buildCtx({ broker: { symbol: { ...defaultSymbol(), enabled: false } } }),
    }),
  },
  {
    rail: 'symbol_whitelist',
    scenario: 'negative',
    expected: 'allow',
    description: 'symbol enabled',
    build: () => ({ intent: defaultIntent(), ctx: buildCtx({}) }),
  },
  // 9 — idempotency
  {
    rail: 'idempotency',
    scenario: 'positive',
    expected: 'reject',
    description: 'clientOrderId already seen',
    build: () => {
      const idempotency = new InMemoryIdempotencyStore();
      idempotency.record('01J0XYZ-DUP', NOW - 60_000);
      return {
        intent: defaultIntent({ clientOrderId: '01J0XYZ-DUP' }),
        ctx: buildCtx({ idempotency }),
      };
    },
  },
  {
    rail: 'idempotency',
    scenario: 'negative',
    expected: 'allow',
    description: 'fresh clientOrderId',
    build: () => ({
      intent: defaultIntent({ clientOrderId: '01J0XYZ-FRESH' }),
      ctx: buildCtx({}),
    }),
  },
  // 10 — phase_profit_target
  {
    rail: 'phase_profit_target',
    scenario: 'positive',
    expected: 'reject',
    description: 'closed_balance ≥ INITIAL × (1 + target + buffer) AND min-days complete',
    build: () => ({
      intent: defaultIntent(),
      // INITIAL_CAPITAL=100k × (1 + 0.10 + 0.01) ≈ 111_000. Use a $1 cushion
      // above to stay clear of FP noise; per-cent boundary is locked in
      // rail-10-phase-profit-target.spec.ts.
      ctx: buildCtx({
        broker: {
          closedBalance: 111_001,
          profitTarget: { fractionOfInitial: 0.1, bufferFraction: 0.01, minDaysComplete: true },
        },
      }),
    }),
  },
  {
    rail: 'phase_profit_target',
    scenario: 'negative',
    expected: 'allow',
    description: 'closed_balance below INITIAL × (1 + target + buffer)',
    build: () => ({
      intent: defaultIntent(),
      // 110_999 < 111_000 → must allow; old flat-$50 path would have tripped at
      // 110_050 already. Locks the buffer-as-fraction contract.
      ctx: buildCtx({
        broker: {
          closedBalance: 110_999,
          profitTarget: { fractionOfInitial: 0.1, bufferFraction: 0.01, minDaysComplete: true },
        },
      }),
    }),
  },
  // 11 — defensive_sl
  {
    rail: 'defensive_sl',
    scenario: 'positive',
    expected: 'tighten',
    description: 'trader SL looser than envelope per-trade cap → gateway tightens',
    build: () => ({
      // cap = 100_000 × 0.5/100 = $500; floor headroom = 100_000 - (100_000 - 4_000) = 4_000;
      // maxLoss = min($500, $4_000) = $500; required distance = 500 / (1 × 100) = 5.
      // Trader's SL distance is 10 → tighten.
      intent: defaultIntent({ entryPrice: 2400, stopLossPrice: 2390 }),
      ctx: buildCtx({}),
    }),
  },
  {
    rail: 'defensive_sl',
    scenario: 'negative',
    expected: 'allow',
    description: 'trader SL already within cap',
    build: () => ({
      intent: defaultIntent({ entryPrice: 2400, stopLossPrice: 2397 }), // 3 < required 5
      ctx: buildCtx({}),
    }),
  },
  // 12 — ea_throttle
  {
    rail: 'ea_throttle',
    scenario: 'positive',
    expected: 'reject',
    description: 'token bucket empty for account',
    build: () => {
      const throttle = new InMemoryThrottleStore();
      // Drain the bucket synchronously at NOW.
      for (let i = 0; i < DEFAULT_RAIL_CONFIG.throttleCapacity; i++) {
        throttle.consume({
          accountId: ACCOUNT,
          atMs: NOW,
          capacity: DEFAULT_RAIL_CONFIG.throttleCapacity,
          windowMs: DEFAULT_RAIL_CONFIG.throttleWindowMs,
        });
      }
      return { intent: defaultIntent(), ctx: buildCtx({ throttle }) };
    },
  },
  {
    rail: 'ea_throttle',
    scenario: 'negative',
    expected: 'allow',
    description: 'fresh bucket',
    build: () => ({ intent: defaultIntent(), ctx: buildCtx({}) }),
  },
  // 13 — force_flat_schedule
  {
    rail: 'force_flat_schedule',
    scenario: 'positive',
    expected: 'reject',
    description: 'NEW within forceFlatLeadMin of market close',
    build: () => ({
      intent: defaultIntent(),
      // forceFlatLeadMin=5; market close is 3 minutes ahead → inside window.
      ctx: buildCtx({ broker: { marketCloseAtMs: NOW + 3 * 60 * 1000 } }),
    }),
  },
  {
    rail: 'force_flat_schedule',
    scenario: 'negative',
    expected: 'allow',
    description: 'market close far in the future',
    build: () => ({
      intent: defaultIntent(),
      ctx: buildCtx({ broker: { marketCloseAtMs: NOW + 60 * 60 * 1000 } }),
    }),
  },
  // 14 — monotone_sl_amend
  {
    rail: 'monotone_sl_amend',
    scenario: 'positive',
    expected: 'reject',
    description: 'AMEND loosens SL on a BUY position',
    build: () => ({
      intent: {
        kind: 'AMEND',
        clientOrderId: '01J0XYZ-AMEND-LOOSEN',
        accountId: ACCOUNT,
        envelopeId: ENVELOPE,
        symbol: SYMBOL,
        positionId: 'pos-1',
        side: 'BUY',
        prevStopLossPrice: 2399,
        newStopLossPrice: 2398,
        intendedAtMs: NOW,
      },
      ctx: buildCtx({}),
    }),
  },
  {
    rail: 'monotone_sl_amend',
    scenario: 'negative',
    expected: 'allow',
    description: 'AMEND tightens SL on a BUY position',
    build: () => ({
      intent: {
        kind: 'AMEND',
        clientOrderId: '01J0XYZ-AMEND-TIGHTEN',
        accountId: ACCOUNT,
        envelopeId: ENVELOPE,
        symbol: SYMBOL,
        positionId: 'pos-1',
        side: 'BUY',
        prevStopLossPrice: 2399,
        newStopLossPrice: 2399.5,
        intendedAtMs: NOW,
      },
      ctx: buildCtx({}),
    }),
  },
];

describe('hard-rails matrix (BLUEPRINT §9)', () => {
  test('matrix has 28 cases (14 rails × {positive, negative})', () => {
    expect(CASES).toHaveLength(28);
    for (const rail of HARD_RAIL_KEYS) {
      const subset = CASES.filter((c) => c.rail === rail);
      expect(subset).toHaveLength(2);
      expect(subset.map((c) => c.scenario).sort()).toEqual(['negative', 'positive']);
    }
  });

  for (const c of CASES) {
    test(`rail=${c.rail} scenario=${c.scenario} → ${c.expected} (${c.description})`, () => {
      const { intent, ctx } = c.build();
      const evaluator = RAIL_EVALUATORS[c.rail];
      const decision = evaluator(intent, ctx);
      expect(decision.outcome).toBe(c.expected);
      expect(decision.rail).toBe(c.rail);

      // Structured log emitted exactly once for this rail evaluation.
      const events = (ctx.logger as ReturnType<typeof captureLogger>).events.filter(
        (e) => e.payload.rail === c.rail,
      );
      expect(events).toHaveLength(1);
      const ev = events[0];
      expect(ev).toBeDefined();
      if (ev === undefined) return;
      expect(ev.payload.symbol).toBe(intent.symbol);
      expect(ev.payload.outcome).toBe(c.expected);
      expect(typeof ev.payload.reason).toBe('string');
      expect(ev.payload.reason.length).toBeGreaterThan(0);
      expect(ev.payload.accountId).toBe(intent.accountId);
      expect(ev.payload.envelopeId).toBe(intent.envelopeId);
      expect(ev.payload.clientOrderId).toBe(intent.clientOrderId);
      expect(ev.level).toBe(c.expected === 'reject' ? 'warn' : 'info');
    });
  }
});
