// Rail 10 — phase-aware profit target (BLUEPRINT §9, §8.4 decision N + U).
// Auto-flatten at `closed_balance >= INITIAL_CAPITAL × (1 + target + buffer)`
// AND `min_trading_days_completed`. Both `target` and `buffer` are fractions
// of INITIAL_CAPITAL per §8.2 (`profit_target_buffer_pct: 1.0` ⇒ 0.01). Rail
// forbids new entries; CLOSE/AMEND continue so the gateway can drain.

import type { RailDecision } from '@ankit-prop/contracts';
import { logDecision } from './log-decision.ts';
import { isoNow, type RailContext, type RailIntent } from './types.ts';

// Sanity ceiling. A buffer above 50% of INITIAL_CAPITAL is meaningless (it
// would exceed any sane phase target) and almost certainly a config bug —
// fail-closed by throwing so we never silently widen the profit-target gate.
const MAX_BUFFER_FRACTION = 0.5;

export function evaluatePhaseProfitTarget(intent: RailIntent, ctx: RailContext): RailDecision {
  const { broker } = ctx;
  const decidedAt = isoNow(broker.nowMs);

  if (intent.kind !== 'NEW') {
    return logDecision(intent, ctx, {
      rail: 'phase_profit_target',
      outcome: 'allow',
      reason: `${intent.kind} permitted while draining toward phase advance`,
      detail: { intentKind: intent.kind },
      decidedAt,
    });
  }

  const { fractionOfInitial, bufferFraction } = broker.profitTarget;
  if (
    !Number.isFinite(bufferFraction) ||
    bufferFraction < 0 ||
    bufferFraction > MAX_BUFFER_FRACTION
  ) {
    throw new Error(
      `rail_10: profitTarget.bufferFraction=${bufferFraction} out of range [0, ${MAX_BUFFER_FRACTION}]`,
    );
  }

  const targetClosedBalance = broker.initialBalance * (1 + fractionOfInitial + bufferFraction);
  const targetHit = broker.closedBalance >= targetClosedBalance;
  const minDays = broker.profitTarget.minDaysComplete;
  const blocked = targetHit && minDays;
  return logDecision(intent, ctx, {
    rail: 'phase_profit_target',
    outcome: blocked ? 'reject' : 'allow',
    reason: blocked
      ? `closed_balance ${broker.closedBalance.toFixed(2)} >= target ${targetClosedBalance.toFixed(2)} & min-days complete`
      : targetHit
        ? 'target hit but min trading days not yet complete'
        : `closed_balance ${broker.closedBalance.toFixed(2)} below target ${targetClosedBalance.toFixed(2)}`,
    detail: {
      closedBalance: broker.closedBalance,
      targetClosedBalance,
      minDaysComplete: minDays,
      phase: broker.phase,
    },
    decidedAt,
  });
}
