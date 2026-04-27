import { z } from 'zod';

// BLUEPRINT §9 — the 14 hard guardrails enforced by the gateway.
// Order matches the §9 table; renumbering breaks the rails-matrix tests.
export const HARD_RAIL_KEYS = [
  'daily_breaker',
  'overall_breaker',
  'news_blackout_5m',
  'news_pre_kill_2h',
  'min_hold_60s',
  'spread_guard',
  'slippage_guard',
  'symbol_whitelist',
  'idempotency',
  'phase_profit_target',
  'defensive_sl',
  'ea_throttle',
  'force_flat_schedule',
  'monotone_sl_amend',
] as const;
export type HardRailKey = (typeof HARD_RAIL_KEYS)[number];

export const HARD_RAIL_NUMBER: Record<HardRailKey, number> = {
  daily_breaker: 1,
  overall_breaker: 2,
  news_blackout_5m: 3,
  news_pre_kill_2h: 4,
  min_hold_60s: 5,
  spread_guard: 6,
  slippage_guard: 7,
  symbol_whitelist: 8,
  idempotency: 9,
  phase_profit_target: 10,
  defensive_sl: 11,
  ea_throttle: 12,
  force_flat_schedule: 13,
  monotone_sl_amend: 14,
};

// `allow`   — the requested action passes the rail unchanged.
// `tighten` — the rail mutates the action (e.g. defensive SL pulled in) and lets it through.
// `reject`  — the rail blocks the action; gateway must not transmit to broker.
export const RAIL_OUTCOMES = ['allow', 'tighten', 'reject'] as const;
export type RailOutcome = (typeof RAIL_OUTCOMES)[number];

export const RailDecision = z.strictObject({
  rail: z.enum(HARD_RAIL_KEYS),
  outcome: z.enum(RAIL_OUTCOMES),
  reason: z.string().min(1),
  detail: z.record(z.string(), z.unknown()),
  decidedAt: z.string(),
});
export type RailDecision = z.infer<typeof RailDecision>;

// A composite verdict aggregates per-rail decisions for one gateway action.
// Final outcome = `reject` if any rail rejected, else `tighten` if any rail
// tightened, else `allow`. Computed deterministically by `composeRailVerdict`.
// `reason` is populated only for synthetic verdicts the composer constructs
// without a per-rail decision to anchor the rationale (today: the fail-closed
// `[]` path). Real verdicts carry their reasons inside `decisions[*]`.
export const RailVerdict = z.strictObject({
  outcome: z.enum(RAIL_OUTCOMES),
  decisions: z.array(RailDecision),
  decidedAt: z.string(),
  reason: z.string().min(1).optional(),
});
export type RailVerdict = z.infer<typeof RailVerdict>;

export const NO_RAILS_EVALUATED_REASON = 'no rails evaluated — fail-closed' as const;

export function composeRailVerdict(decisions: RailDecision[], decidedAt: string): RailVerdict {
  // Fail-closed at the contract surface (BLUEPRINT §3.5, ANKA-32 / ANKA-19
  // H-6). A dispatcher bug, a feature flag short-circuit, or a test wiring
  // that produces zero rail decisions must NOT yield a green verdict. Emit a
  // synthetic reject that surfaces in dispatcher dashboards via `reason`
  // rather than throwing — operators see WHY the order was blocked without
  // the gateway crash-looping.
  if (decisions.length === 0) {
    return RailVerdict.parse({
      outcome: 'reject',
      decisions: [],
      decidedAt,
      reason: NO_RAILS_EVALUATED_REASON,
    });
  }
  let outcome: RailOutcome = 'allow';
  for (const d of decisions) {
    if (d.outcome === 'reject') {
      outcome = 'reject';
      break;
    }
    if (d.outcome === 'tighten') outcome = 'tighten';
  }
  return RailVerdict.parse({ outcome, decisions, decidedAt });
}

// FTMO floor + per-trade-cap units are *fractions of INITIAL_CAPITAL* across
// the rails surface (0.04 = 4%). 0.5 is the hard ceiling: anything above is
// almost certainly a percent slipped in (4 instead of 0.04) and would silently
// shift the floor by 100×. Reject at the contract boundary (ANKA-30 H-3/H-4).
export const LossFraction = z.number().nonnegative().max(0.5);
export type LossFraction = z.infer<typeof LossFraction>;

export const EnvelopeFloors = z.strictObject({
  internalDailyLossFraction: LossFraction,
  internalOverallLossFraction: LossFraction,
});
export type EnvelopeFloors = z.infer<typeof EnvelopeFloors>;
