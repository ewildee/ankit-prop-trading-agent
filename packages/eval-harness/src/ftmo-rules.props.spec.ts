// Property-based tests for FTMO rule semantics — invariants over random valid
// inputs, not example tables. Pairs with `ftmo-rules.spec.ts` (example tests).
//
// Determinism: every test uses a fixed-seed PRNG so a passing run is repeatable
// and a failure can be re-driven by reading the seeded indices from output.

import { describe, expect, test } from 'bun:test';
import {
  buildBlackoutWindows,
  FTMO_DEFAULT_LINE,
  FtmoSimulator,
  type FtmoSimulatorCfg,
  INTERNAL_DEFAULT_MARGINS,
} from './ftmo-rules.ts';
import type { ClosedTrade, SimPosition } from './types.ts';

const TRIALS = 80;
const INITIAL = 100_000;

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function cfg(overrides: Partial<FtmoSimulatorCfg> = {}): FtmoSimulatorCfg {
  return {
    accountId: 'ftmo-prop',
    envelopeId: null,
    initialCapital: INITIAL,
    ftmoMargins: FTMO_DEFAULT_LINE,
    internalMargins: INTERNAL_DEFAULT_MARGINS,
    symbols: new Map([['XAUUSD', { pipSize: 0.1, contractSize: 100 }]]),
    newsBlackoutWindows: [],
    preNewsBlackoutWindows: [],
    weekendCloseTimestampsMs: [],
    hftMinHoldShareThreshold: 0.05,
    consistencyMaxShare: 0.45,
    consistencyCheckEnabled: false,
    consistencyMinTrades: 10,
    ...overrides,
  };
}

const DAY = Date.UTC(2026, 0, 5, 0, 0, 0);
const NOON = DAY + 12 * 3_600_000;

describe('FTMO rules — property invariants', () => {
  test('any equity strictly below internal daily floor records internal daily_loss', () => {
    const rand = mulberry32(0xa11ce);
    const internalFloor = INITIAL * (1 - INTERNAL_DEFAULT_MARGINS.dailyLossFraction);
    for (let i = 0; i < TRIALS; i++) {
      const sim = new FtmoSimulator(cfg());
      sim.setInitialDay(DAY, INITIAL);
      // pick equity in [ftmoFloor, internalFloor) so we never expect ftmo breach
      const ftmoFloor = INITIAL * (1 - FTMO_DEFAULT_LINE.dailyLossFraction);
      const span = internalFloor - ftmoFloor;
      const equity = ftmoFloor + rand() * (span - 0.01);
      sim.onEquity(NOON, equity);
      const breaches = sim.getBreaches();
      const internal = breaches.find((b) => b.kind === 'daily_loss' && b.scope === 'internal');
      const ftmo = breaches.find((b) => b.kind === 'daily_loss' && b.scope === 'ftmo');
      expect(internal, `trial ${i} equity=${equity} should fire internal`).toBeDefined();
      expect(ftmo, `trial ${i} equity=${equity} should NOT fire ftmo`).toBeUndefined();
    }
  });

  test('any equity at or above internal daily floor never records daily_loss', () => {
    const rand = mulberry32(0xb0b);
    const internalFloor = INITIAL * (1 - INTERNAL_DEFAULT_MARGINS.dailyLossFraction);
    for (let i = 0; i < TRIALS; i++) {
      const sim = new FtmoSimulator(cfg());
      sim.setInitialDay(DAY, INITIAL);
      // equity strictly at or above internalFloor; cap at INITIAL × 1.05 to keep realistic
      const equity = internalFloor + rand() * (INITIAL * 0.05);
      sim.onEquity(NOON, equity);
      expect(
        sim.getBreaches().some((b) => b.kind === 'daily_loss'),
        `trial ${i} equity=${equity} should not fire`,
      ).toBe(false);
    }
  });

  test('crossing FTMO daily floor always records both internal and ftmo breaches', () => {
    const rand = mulberry32(0xc0fee);
    const ftmoFloor = INITIAL * (1 - FTMO_DEFAULT_LINE.dailyLossFraction);
    for (let i = 0; i < TRIALS; i++) {
      const sim = new FtmoSimulator(cfg());
      sim.setInitialDay(DAY, INITIAL);
      // strictly below ftmo floor
      const equity = ftmoFloor - 1 - rand() * 5_000;
      sim.onEquity(NOON, equity);
      const kinds = sim
        .getBreaches()
        .filter((b) => b.kind === 'daily_loss')
        .map((b) => b.scope);
      expect(kinds).toContain('internal');
      expect(kinds).toContain('ftmo');
    }
  });

  test('overall loss invariant: equity < INITIAL × (1 - internalOverallLossFraction) always trips internal overall_loss', () => {
    const rand = mulberry32(0xd00d);
    const overallFloor = INITIAL * (1 - INTERNAL_DEFAULT_MARGINS.overallLossFraction);
    for (let i = 0; i < TRIALS; i++) {
      const sim = new FtmoSimulator(cfg());
      sim.setInitialDay(DAY, INITIAL);
      // pick equity strictly below overall internal floor
      const equity = overallFloor - 1 - rand() * 5_000;
      sim.onEquity(NOON, equity);
      expect(
        sim.getBreaches().some((b) => b.kind === 'overall_loss' && b.scope === 'internal'),
      ).toBe(true);
    }
  });

  test('min-hold invariant: any closedAt - openedAt < minHoldMs trips min_hold', () => {
    const rand = mulberry32(0xfeed);
    const minHoldMs = INTERNAL_DEFAULT_MARGINS.minHoldMs;
    for (let i = 0; i < TRIALS; i++) {
      const sim = new FtmoSimulator(cfg());
      sim.setInitialDay(DAY, INITIAL);
      const heldMs = Math.max(0, Math.floor(rand() * (minHoldMs - 1)));
      const openedAt = NOON;
      const closedAt = openedAt + heldMs;
      const t: ClosedTrade = {
        id: `t-${i}`,
        symbol: 'XAUUSD',
        side: 'long',
        sizeLots: 0.1,
        openedAt,
        closedAt,
        openPrice: 2050,
        closePrice: 2050.5,
        realizedPnl: 1,
        initialRisk: 50,
        rMultiple: 0.02,
        closeReason: 'strategy',
      };
      sim.onTradeClose(closedAt, t);
      expect(sim.getBreaches().some((b) => b.kind === 'min_hold')).toBe(true);
    }
  });

  test('min-hold invariant: any closedAt - openedAt ≥ minHoldMs never trips min_hold', () => {
    const rand = mulberry32(0xbabe);
    const minHoldMs = INTERNAL_DEFAULT_MARGINS.minHoldMs;
    for (let i = 0; i < TRIALS; i++) {
      const sim = new FtmoSimulator(cfg());
      sim.setInitialDay(DAY, INITIAL);
      const heldMs = minHoldMs + Math.floor(rand() * 10 * minHoldMs);
      const openedAt = NOON;
      const closedAt = openedAt + heldMs;
      const t: ClosedTrade = {
        id: `t-${i}`,
        symbol: 'XAUUSD',
        side: 'long',
        sizeLots: 0.1,
        openedAt,
        closedAt,
        openPrice: 2050,
        closePrice: 2050.5,
        realizedPnl: 1,
        initialRisk: 50,
        rMultiple: 0.02,
        closeReason: 'strategy',
      };
      sim.onTradeClose(closedAt, t);
      expect(sim.getBreaches().some((b) => b.kind === 'min_hold')).toBe(false);
    }
  });

  test('news blackout invariant: any open inside ±half-width window trips news_blackout_open', () => {
    const rand = mulberry32(0xface);
    const eventTs = Date.UTC(2026, 0, 5, 13, 30, 0);
    const halfWidth = INTERNAL_DEFAULT_MARGINS.newsBlackoutHalfWidthMs;
    const windows = buildBlackoutWindows(
      [{ tsMs: eventTs, symbols: ['XAUUSD'], restricted: true }],
      halfWidth,
    ).map((w) => ({ symbols: new Set(w.symbols), startMs: w.startMs, endMs: w.endMs }));
    for (let i = 0; i < TRIALS; i++) {
      const sim = new FtmoSimulator(cfg({ newsBlackoutWindows: windows }));
      sim.setInitialDay(eventTs - 60_000, INITIAL);
      // open in [event - halfWidth, event + halfWidth]
      const offset = Math.floor((rand() * 2 - 1) * halfWidth);
      const openedAt = eventTs + offset;
      const pos: SimPosition = {
        id: `p-${i}`,
        symbol: 'XAUUSD',
        side: 'long',
        sizeLots: 0.1,
        openedAt,
        openPrice: 2050,
        stopLoss: 2045,
      };
      sim.onTradeOpen(openedAt, pos);
      expect(sim.getBreaches().some((b) => b.kind === 'news_blackout_open')).toBe(true);
    }
  });

  test('news blackout invariant: any open outside window does not trip news_blackout_open (5-min half-width)', () => {
    const rand = mulberry32(0xcafe);
    const eventTs = Date.UTC(2026, 0, 5, 13, 30, 0);
    const halfWidth = INTERNAL_DEFAULT_MARGINS.newsBlackoutHalfWidthMs;
    const preWidth = INTERNAL_DEFAULT_MARGINS.preNewsBlackoutMs;
    const windows = buildBlackoutWindows(
      [{ tsMs: eventTs, symbols: ['XAUUSD'], restricted: true }],
      halfWidth,
    ).map((w) => ({ symbols: new Set(w.symbols), startMs: w.startMs, endMs: w.endMs }));
    for (let i = 0; i < TRIALS; i++) {
      const sim = new FtmoSimulator(cfg({ newsBlackoutWindows: windows }));
      // open well after the ±5m window AND after the event so neither
      // ±5m blackout nor 2h pre-news kill-switch can apply.
      const openedAt = eventTs + halfWidth + 60_000 + Math.floor(rand() * preWidth);
      sim.setInitialDay(openedAt - 60_000, INITIAL);
      const pos: SimPosition = {
        id: `p-${i}`,
        symbol: 'XAUUSD',
        side: 'long',
        sizeLots: 0.1,
        openedAt,
        openPrice: 2050,
        stopLoss: 2045,
      };
      sim.onTradeOpen(openedAt, pos);
      expect(sim.getBreaches().some((b) => b.kind === 'news_blackout_open')).toBe(false);
    }
  });

  test('EA throttle invariant: count = cap + 1 trips, count = cap does not', () => {
    const cap = INTERNAL_DEFAULT_MARGINS.eaRequestsPerDay;

    const at = (n: number, base: number) => base + n;
    // exactly cap → no breach
    const sim1 = new FtmoSimulator(cfg());
    sim1.setInitialDay(DAY, INITIAL);
    for (let i = 0; i < cap; i++) sim1.recordEaRequest(at(i, NOON));
    expect(sim1.getBreaches().some((b) => b.kind === 'ea_throttle_exceeded')).toBe(false);

    // cap + 1 → breach
    const sim2 = new FtmoSimulator(cfg());
    sim2.setInitialDay(DAY, INITIAL);
    for (let i = 0; i < cap + 1; i++) sim2.recordEaRequest(at(i, NOON));
    expect(sim2.getBreaches().some((b) => b.kind === 'ea_throttle_exceeded')).toBe(true);
  });

  test('EA throttle resets on day rollover (count <= cap on each day individually)', () => {
    const cap = INTERNAL_DEFAULT_MARGINS.eaRequestsPerDay;
    const sim = new FtmoSimulator(cfg());
    const day1 = Date.UTC(2026, 0, 5, 8, 0, 0);
    const day2 = Date.UTC(2026, 0, 6, 8, 0, 0);
    sim.setInitialDay(day1, INITIAL);
    for (let i = 0; i < cap; i++) sim.recordEaRequest(day1 + i);
    sim.onDayRollover(day2, INITIAL);
    for (let i = 0; i < cap; i++) sim.recordEaRequest(day2 + i);
    expect(sim.getBreaches().some((b) => b.kind === 'ea_throttle_exceeded')).toBe(false);
  });
});
