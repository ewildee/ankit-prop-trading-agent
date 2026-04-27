import { describe, expect, test } from 'bun:test';
import {
  composeRailVerdict,
  HARD_RAIL_KEYS,
  HARD_RAIL_NUMBER,
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

  test('empty decision list → allow (fail-open is wrong; fail-closed lives at the caller, not here)', () => {
    // The composer is a pure aggregator; gateway fail-closed defaults are
    // BLUEPRINT §3.5 and applied by the rail dispatcher, not by this function.
    const v = composeRailVerdict([], at);
    expect(v.outcome).toBe('allow');
    expect(v.decisions).toHaveLength(0);
  });

  test('returned verdict round-trips through Zod', () => {
    const v = composeRailVerdict([rejectD], at);
    expect(() => RailVerdict.parse(v)).not.toThrow();
  });
});
