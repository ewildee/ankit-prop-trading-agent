// Rail 10 — phase-aware profit target (BLUEPRINT §9, §8.4 decision N + U).
// Auto-flatten at `closed_balance >= INITIAL_CAPITAL × (1 + target) + buffer`
// AND `min_trading_days_completed`. Rail forbids new entries; CLOSE/AMEND
// continue so the gateway can drain the open positions.

import type { RailDecision } from '@ankit-prop/contracts';
import { logDecision } from './log-decision.ts';
import { isoNow, type RailContext, type RailIntent } from './types.ts';

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

  const targetClosedBalance =
    broker.initialBalance * (1 + broker.profitTarget.fractionOfInitial) +
    broker.profitTarget.bufferDollars;
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
