// Rail 9 — `clientOrderId` (ULID) idempotency (BLUEPRINT §9).
// Registry persisted across restart via SqliteIdempotencyStore. Allow-side of
// the rail records the id so a retry of the same intent is rejected.

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
  idempotency.record(intent.clientOrderId, broker.nowMs);
  return logDecision(intent, ctx, {
    rail: 'idempotency',
    outcome: 'allow',
    reason: 'clientOrderId not previously seen',
    detail: { clientOrderId: intent.clientOrderId },
    decidedAt,
  });
}
