// Two-phase rail dispatch — see BLUEPRINT.md §9 "Two-phase gateway evaluation".

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
