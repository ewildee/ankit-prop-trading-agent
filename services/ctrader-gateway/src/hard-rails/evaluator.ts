// Composer that runs the §9 rail catalog and aggregates a `RailVerdict`.
//
// The dispatcher contract (ANKA-29 / ANKA-19 H-2) splits evaluation into two
// strictly ordered phases tied to the broker lifecycle of a single
// `clientOrderId`:
//
//   1. `evaluatePreSubmitRails(intent, ctx)` — MUST be called before the
//      gateway transmits the intent to the broker. Runs rails 1–6 and 8–14
//      (i.e. every rail except 7 — slippage, which has no input until the
//      fill report arrives). Stops at the first `reject` so a tripped
//      breaker does not leak side-effects (idempotency slot, throttle
//      token). On a non-`reject` composite, records `clientOrderId` exactly
//      once into the idempotency registry (rail 9 record-on-allow,
//      ANKA-28 / H-1).
//
//   2. `evaluatePostFillRails(intent, ctx)` — MUST be called after the
//      broker reports a fill on the same `clientOrderId`. Runs rail 7 only
//      (post-fill slippage guard). Has no idempotency or throttle side-
//      effects: rail 7 cannot be retried by the operator (the position is
//      already open) and re-running the full chain would double-consume the
//      ULID and burn another token (the H-2 bug this split fixes).
//
// Calling `evaluatePostFillRails` without a corresponding `BrokerSnapshot
// .fill` is a dispatcher invariant violation. The post-fill function does
// not throw — rail 7 itself fail-closes (returns `reject`) on missing fill
// data per BLUEPRINT §3.5 (ANKA-40), so a malformed reconciliation cannot
// silently let the just-opened position skip the slippage cap. Dispatcher
// tests still assert the invariant.

import type { HardRailKey, RailDecision, RailVerdict } from '@ankit-prop/contracts';
import { composeRailVerdict, HARD_RAIL_KEYS } from '@ankit-prop/contracts';
import { evaluateDailyBreaker } from './rail-1-daily-breaker.ts';
import { evaluateOverallBreaker } from './rail-2-overall-breaker.ts';
import { evaluateNewsBlackout } from './rail-3-news-blackout.ts';
import { evaluateNewsPreKill } from './rail-4-news-pre-kill.ts';
import { evaluateMinHold } from './rail-5-min-hold.ts';
import { evaluateSpreadGuard } from './rail-6-spread-guard.ts';
import { evaluateSlippageGuard } from './rail-7-slippage-guard.ts';
import { evaluateSymbolWhitelist } from './rail-8-symbol-whitelist.ts';
import { evaluateIdempotency } from './rail-9-idempotency.ts';
import { evaluatePhaseProfitTarget } from './rail-10-phase-profit-target.ts';
import { evaluateDefensiveSl } from './rail-11-defensive-sl.ts';
import { evaluateEaThrottle } from './rail-12-ea-throttle.ts';
import { evaluateForceFlatSchedule } from './rail-13-force-flat-schedule.ts';
import { evaluateMonotoneSlAmend } from './rail-14-monotone-sl-amend.ts';
import { isoNow, type RailContext, type RailEvaluator, type RailIntent } from './types.ts';

export const RAIL_EVALUATORS: Readonly<Record<HardRailKey, RailEvaluator>> = {
  daily_breaker: evaluateDailyBreaker,
  overall_breaker: evaluateOverallBreaker,
  news_blackout_5m: evaluateNewsBlackout,
  news_pre_kill_2h: evaluateNewsPreKill,
  min_hold_60s: evaluateMinHold,
  spread_guard: evaluateSpreadGuard,
  slippage_guard: evaluateSlippageGuard,
  symbol_whitelist: evaluateSymbolWhitelist,
  idempotency: evaluateIdempotency,
  phase_profit_target: evaluatePhaseProfitTarget,
  defensive_sl: evaluateDefensiveSl,
  ea_throttle: evaluateEaThrottle,
  force_flat_schedule: evaluateForceFlatSchedule,
  monotone_sl_amend: evaluateMonotoneSlAmend,
};

// Rail 7 is the only post-fill check; everything else runs pre-submit.
export const POST_FILL_RAIL_KEYS = ['slippage_guard'] as const satisfies readonly HardRailKey[];
export const PRE_SUBMIT_RAIL_KEYS: readonly HardRailKey[] = HARD_RAIL_KEYS.filter(
  (k): k is HardRailKey => !(POST_FILL_RAIL_KEYS as readonly HardRailKey[]).includes(k),
);

export function evaluatePreSubmitRails(intent: RailIntent, ctx: RailContext): RailVerdict {
  const decisions: RailDecision[] = [];
  for (const key of PRE_SUBMIT_RAIL_KEYS) {
    const decision = RAIL_EVALUATORS[key](intent, ctx);
    decisions.push(decision);
    if (decision.outcome === 'reject') break;
  }
  const verdict = composeRailVerdict(decisions, isoNow(ctx.broker.nowMs));
  if (verdict.outcome !== 'reject') {
    ctx.idempotency.record(intent.clientOrderId, ctx.broker.nowMs);
  }
  return verdict;
}

export function evaluatePostFillRails(intent: RailIntent, ctx: RailContext): RailVerdict {
  const decisions: RailDecision[] = [];
  for (const key of POST_FILL_RAIL_KEYS) {
    decisions.push(RAIL_EVALUATORS[key](intent, ctx));
  }
  return composeRailVerdict(decisions, isoNow(ctx.broker.nowMs));
}
