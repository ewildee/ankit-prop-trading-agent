import { describe, expect, test } from 'bun:test';
import {
  composeRailVerdict,
  EnvelopeFloors,
  HARD_RAIL_KEYS,
  HARD_RAIL_NUMBER,
  LossFraction,
  NO_RAILS_EVALUATED_REASON,
  RailDecision,
  RailVerdict,
} from './hard-rails.ts';

describe('HARD_RAIL_KEYS', () => {
  test('exposes exactly 14 rails (BLUEPRINT §9)', () => {
    expect(HARD_RAIL_KEYS).toHaveLength(14);
  });

  test('rail numbers cover 1..14 with no gaps and match catalog order', () => {
    const numbers = HARD_RAIL_KEYS.map((k) => HARD_RAIL_NUMBER[k]);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });
});

describe('RailDecision', () => {
  test('accepts a minimal allow decision', () => {
    const d = RailDecision.parse({
      rail: 'idempotency',
      outcome: 'allow',
      reason: 'clientOrderId not seen before',
      detail: { clientOrderId: '01HZAB...' },
      decidedAt: '2026-04-27T16:00:00+02:00',
    });
    expect(d.outcome).toBe('allow');
  });

  test('rejects empty reason', () => {
    expect(() =>
      RailDecision.parse({
        rail: 'daily_breaker',
        outcome: 'reject',
        reason: '',
        detail: {},
        decidedAt: '2026-04-27T16:00:00+02:00',
      }),
    ).toThrow();
  });

  test('rejects unknown rail key', () => {
    expect(() =>
      RailDecision.parse({
        rail: 'made_up_rail',
        outcome: 'allow',
        reason: 'ok',
        detail: {},
        decidedAt: '2026-04-27T16:00:00+02:00',
      }),
    ).toThrow();
  });

  test('rejects extra keys (strict)', () => {
    expect(() =>
      RailDecision.parse({
        rail: 'idempotency',
        outcome: 'allow',
        reason: 'ok',
        detail: {},
        decidedAt: '2026-04-27T16:00:00+02:00',
        extra: true,
      }),
    ).toThrow();
  });
});

describe('composeRailVerdict', () => {
  const at = '2026-04-27T16:00:00+02:00';
  const allowD = (rail: 'idempotency' | 'symbol_whitelist'): RailDecision => ({
    rail,
    outcome: 'allow',
    reason: 'pass',
    detail: {},
    decidedAt: at,
  });
  const tightenD: RailDecision = {
    rail: 'defensive_sl',
    outcome: 'tighten',
    reason: 'SL pulled to envelope floor',
    detail: { from: 1.0, to: 0.8 },
    decidedAt: at,
  };
  const rejectD: RailDecision = {
    rail: 'daily_breaker',
    outcome: 'reject',
    reason: '4% daily breaker tripped',
    detail: {},
    decidedAt: at,
  };

  test('all-allow → allow', () => {
    const v = composeRailVerdict([allowD('idempotency'), allowD('symbol_whitelist')], at);
    expect(v.outcome).toBe('allow');
    expect(v.decisions).toHaveLength(2);
  });

  test('any tighten without reject → tighten', () => {
    const v = composeRailVerdict([allowD('idempotency'), tightenD], at);
    expect(v.outcome).toBe('tighten');
  });

  test('any reject dominates everything else', () => {
    const v = composeRailVerdict([allowD('idempotency'), tightenD, rejectD], at);
    expect(v.outcome).toBe('reject');
  });

  test('empty decision list → synthetic reject with fail-closed reason (ANKA-32 / ANKA-19 H-6)', () => {
    // BLUEPRINT §3.5: the contract surface itself fails closed. A dispatcher
    // bug, feature flag short-circuit, or test wiring that supplies zero rail
    // decisions must NOT yield a green verdict. The synthetic `reason` makes
    // the cause observable to dispatcher dashboards instead of throwing.
    const v = composeRailVerdict([], at);
    expect(v.outcome).toBe('reject');
    expect(v.decisions).toHaveLength(0);
    expect(v.reason).toBe(NO_RAILS_EVALUATED_REASON);
    expect(NO_RAILS_EVALUATED_REASON).toBe('no rails evaluated — fail-closed');
  });

  test('non-empty verdicts do not carry a top-level reason (reason lives on decisions[*])', () => {
    const v = composeRailVerdict([rejectD], at);
    expect(v.reason).toBeUndefined();
    expect(v.decisions[0]?.reason).toBe('4% daily breaker tripped');
  });

  test('returned verdict round-trips through Zod (synthetic and real)', () => {
    expect(() => RailVerdict.parse(composeRailVerdict([rejectD], at))).not.toThrow();
    expect(() => RailVerdict.parse(composeRailVerdict([], at))).not.toThrow();
  });
});

describe('LossFraction', () => {
  test('accepts the canonical FTMO floor fractions', () => {
    expect(LossFraction.parse(0)).toBe(0);
    expect(LossFraction.parse(0.04)).toBe(0.04);
    expect(LossFraction.parse(0.08)).toBe(0.08);
    expect(LossFraction.parse(0.5)).toBe(0.5);
  });

  test('rejects values > 0.5 (catches percent-as-fraction wiring crossover)', () => {
    expect(() => LossFraction.parse(0.51)).toThrow();
    expect(() => LossFraction.parse(4)).toThrow();
    expect(() => LossFraction.parse(8)).toThrow();
    expect(() => LossFraction.parse(100)).toThrow();
  });

  test('rejects negatives', () => {
    expect(() => LossFraction.parse(-0.01)).toThrow();
  });
});

describe('EnvelopeFloors', () => {
  test('accepts BLUEPRINT defaults (4% daily / 8% overall as fractions)', () => {
    const f = EnvelopeFloors.parse({
      internalDailyLossFraction: 0.04,
      internalOverallLossFraction: 0.08,
    });
    expect(f.internalDailyLossFraction).toBe(0.04);
    expect(f.internalOverallLossFraction).toBe(0.08);
  });

  test('rejects percent-shaped values (>0.5)', () => {
    expect(() =>
      EnvelopeFloors.parse({
        internalDailyLossFraction: 4,
        internalOverallLossFraction: 8,
      }),
    ).toThrow();
  });

  test('rejects extra keys (strict)', () => {
    expect(() =>
      EnvelopeFloors.parse({
        internalDailyLossFraction: 0.04,
        internalOverallLossFraction: 0.08,
        extra: 0.01,
      }),
    ).toThrow();
  });
});
