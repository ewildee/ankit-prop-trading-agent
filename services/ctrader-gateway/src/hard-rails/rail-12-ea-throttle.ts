// Rail 12 — EA throttle (BLUEPRINT §9, decision O). 1,800/day per account
// token bucket, persisted across process restart via SqliteThrottleStore.
// Every NEW/AMEND/CLOSE consumes one token.

import type { RailDecision } from '@ankit-prop/contracts';
import { logDecision } from './log-decision.ts';
import { isoNow, type RailContext, type RailIntent } from './types.ts';

export function evaluateEaThrottle(intent: RailIntent, ctx: RailContext): RailDecision {
  const { broker, throttle, config } = ctx;
  const decidedAt = isoNow(broker.nowMs);
  const result = throttle.consume({
    accountId: intent.accountId,
    atMs: broker.nowMs,
    capacity: config.throttleCapacity,
    windowMs: config.throttleWindowMs,
  });
  return logDecision(intent, ctx, {
    rail: 'ea_throttle',
    outcome: result.allowed ? 'allow' : 'reject',
    reason: result.allowed
      ? `token consumed; ${result.remaining} remaining (cap ${config.throttleCapacity}/${Math.floor(config.throttleWindowMs / 3600000)}h)`
      : `bucket empty (cap ${config.throttleCapacity}/${Math.floor(config.throttleWindowMs / 3600000)}h)`,
    detail: { remaining: result.remaining, capacity: config.throttleCapacity },
    decidedAt,
  });
}
