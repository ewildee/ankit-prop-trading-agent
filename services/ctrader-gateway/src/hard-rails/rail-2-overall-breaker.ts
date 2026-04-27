// Rail 2 — 8% overall breaker (BLUEPRINT §9, §8.3).
// Envelope-wide equity vs initial balance. Reject everything below the
// internal overall floor (1 - 0.08) × INITIAL_CAPITAL by default.

import type { RailDecision } from '@ankit-prop/contracts';
import { logDecision } from './log-decision.ts';
import { isoNow, type RailContext, type RailIntent } from './types.ts';

export function evaluateOverallBreaker(intent: RailIntent, ctx: RailContext): RailDecision {
  const { broker } = ctx;
  const floor = (1 - broker.envelopeFloors.internalOverallFloorPct) * broker.initialBalance;
  const breached = broker.equity < floor;
  const decision: RailDecision = {
    rail: 'overall_breaker',
    outcome: breached ? 'reject' : 'allow',
    reason: breached
      ? `equity ${broker.equity.toFixed(2)} < internal-overall-floor ${floor.toFixed(2)}`
      : 'equity above internal-overall-floor',
    detail: {
      equity: broker.equity,
      initialBalance: broker.initialBalance,
      internalOverallFloor: floor,
    },
    decidedAt: isoNow(broker.nowMs),
  };
  return logDecision(intent, ctx, decision);
}
