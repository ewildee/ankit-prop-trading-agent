// Composer that runs the §9 rail catalog in order and aggregates a
// `RailVerdict`. Stops at the first `reject` so a tripped breaker does not
// leak side-effects (e.g. consuming an idempotency slot or a throttle token).

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

// Evaluation order matches the §9 catalog so the rejection log identifies
// the lowest-numbered tripping rail (operationally easier to reason about).
// Short-circuiting on first reject prevents unintended state consumption by
// idempotency (rail 9) and throttle (rail 12).
//
// Rail 9 idempotency is recorded HERE (not inside the rail itself) once the
// composite verdict is non-`reject`, so a downstream rail-10..14 reject does
// not consume the ULID. The operator's same-`clientOrderId` retry after the
// breaker clears must succeed rail 9 (ANKA-28 / ANKA-19 H-1).
export function evaluateAllRails(intent: RailIntent, ctx: RailContext): RailVerdict {
  const decisions: RailDecision[] = [];
  for (const key of HARD_RAIL_KEYS) {
    const evaluator = RAIL_EVALUATORS[key];
    const decision = evaluator(intent, ctx);
    decisions.push(decision);
    if (decision.outcome === 'reject') break;
  }
  const verdict = composeRailVerdict(decisions, isoNow(ctx.broker.nowMs));
  if (verdict.outcome !== 'reject') {
    ctx.idempotency.record(intent.clientOrderId, ctx.broker.nowMs);
  }
  return verdict;
}
