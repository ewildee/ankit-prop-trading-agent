// Rail 1 — 4% daily breaker (BLUEPRINT §9, §8.3).
// Envelope-wide equity vs locked-at-midnight floor. Reject any new/amend/close
// once equity has crossed below the internal daily floor — at that point the
// envelope is halted and trading must stop.

import type { RailDecision } from '@ankit-prop/contracts';
import { logDecision } from './log-decision.ts';
import { isoNow, type RailContext, type RailIntent } from './types.ts';

export function evaluateDailyBreaker(intent: RailIntent, ctx: RailContext): RailDecision {
  const { broker } = ctx;
  const floor =
    broker.dayStartBalance - broker.envelopeFloors.internalDailyFloorPct * broker.initialBalance;
  const breached = broker.equity < floor;
  const decision: RailDecision = {
    rail: 'daily_breaker',
    outcome: breached ? 'reject' : 'allow',
    reason: breached
      ? `equity ${broker.equity.toFixed(2)} < internal-daily-floor ${floor.toFixed(2)}`
      : 'equity above internal-daily-floor',
    detail: {
      equity: broker.equity,
      dayStartBalance: broker.dayStartBalance,
      initialBalance: broker.initialBalance,
      internalDailyFloor: floor,
    },
    decidedAt: isoNow(broker.nowMs),
  };
  return logDecision(intent, ctx, decision);
}
