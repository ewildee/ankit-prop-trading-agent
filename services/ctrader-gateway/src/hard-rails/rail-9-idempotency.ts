// Rail 9 — `clientOrderId` (ULID) idempotency (BLUEPRINT §9).
// Registry persisted across restart via SqliteIdempotencyStore. The rail's
// `has(...)` check early-rejects when the ULID has already been honoured;
// the corresponding `record(...)` lives in `evaluator.ts` and only fires when
// `composeRailVerdict` produces a non-`reject` outcome, so a tripped breaker
// downstream (rails 10–14) does not consume an idempotency slot. Operator
// re-runs of the same `clientOrderId` after an intermittent throttle / force-
// flat reject must succeed (ANKA-28 / ANKA-19 H-1).

import type { RailDecision } from '@ankit-prop/contracts';
import { logDecision } from './log-decision.ts';
import { isoNow, type RailContext, type RailIntent } from './types.ts';

export function evaluateIdempotency(intent: RailIntent, ctx: RailContext): RailDecision {
  const { broker, idempotency } = ctx;
  const decidedAt = isoNow(broker.nowMs);

  if (idempotency.has(intent.clientOrderId)) {
    return logDecision(intent, ctx, {
      rail: 'idempotency',
      outcome: 'reject',
      reason: 'clientOrderId already seen',
      detail: { clientOrderId: intent.clientOrderId },
      decidedAt,
    });
  }
  return logDecision(intent, ctx, {
    rail: 'idempotency',
    outcome: 'allow',
    reason: 'clientOrderId not previously seen',
    detail: { clientOrderId: intent.clientOrderId },
    decidedAt,
  });
}
