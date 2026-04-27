// Rail 5 — 60-second min-hold versus the previous trade on the same symbol
// (BLUEPRINT §9). Applies to NEW entries only.

import type { RailDecision } from '@ankit-prop/contracts';
import { logDecision } from './log-decision.ts';
import { isoNow, type RailContext, type RailIntent } from './types.ts';

export function evaluateMinHold(intent: RailIntent, ctx: RailContext): RailDecision {
  const { broker, config } = ctx;
  const decidedAt = isoNow(broker.nowMs);

  if (intent.kind !== 'NEW') {
    return logDecision(intent, ctx, {
      rail: 'min_hold_60s',
      outcome: 'allow',
      reason: `${intent.kind} not subject to min-hold`,
      detail: { intentKind: intent.kind },
      decidedAt,
    });
  }

  const last = broker.lastTradeBySymbol[intent.symbol];
  if (last === undefined) {
    return logDecision(intent, ctx, {
      rail: 'min_hold_60s',
      outcome: 'allow',
      reason: 'no prior trade on symbol',
      detail: {},
      decidedAt,
    });
  }
  const elapsedMs = broker.nowMs - last.closedAtMs;
  const minMs = config.minHoldSeconds * 1000;
  const tooSoon = elapsedMs < minMs;
  return logDecision(intent, ctx, {
    rail: 'min_hold_60s',
    outcome: tooSoon ? 'reject' : 'allow',
    reason: tooSoon
      ? `prev trade ${Math.floor(elapsedMs / 1000)}s ago < ${config.minHoldSeconds}s min-hold`
      : `prev trade ${Math.floor(elapsedMs / 1000)}s ago, min-hold satisfied`,
    detail: { elapsedMs, minHoldMs: minMs },
    decidedAt,
  });
}
