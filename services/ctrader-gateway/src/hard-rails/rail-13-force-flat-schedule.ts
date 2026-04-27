// Rail 13 — force-flat schedule (BLUEPRINT §9, §11.6, decision L.1 + M.2).
// No new entries within the lead-min window of:
//   - market_close - forceFlatLeadMin
//   - friday_close - forceFlatLeadMin
//   - next restricted event - preNewsFlattenLeadMin (default 6, decision M.2)
// AMEND/CLOSE remain allowed so the gateway can drain into the close.

import type { RailDecision } from '@ankit-prop/contracts';
import { isInsideForceFlatWindow } from './force-flat-scheduler.ts';
import { logDecision } from './log-decision.ts';
import { isoNow, type RailContext, type RailIntent } from './types.ts';

export function evaluateForceFlatSchedule(intent: RailIntent, ctx: RailContext): RailDecision {
  const { broker, news } = ctx;
  const decidedAt = isoNow(broker.nowMs);

  if (intent.kind !== 'NEW') {
    return logDecision(intent, ctx, {
      rail: 'force_flat_schedule',
      outcome: 'allow',
      reason: `${intent.kind} permitted inside force-flat window (drain path)`,
      detail: { intentKind: intent.kind },
      decidedAt,
    });
  }

  const next = news.nextRestrictedEvent(intent.symbol, broker.nowMs);
  const inside = isInsideForceFlatWindow({
    nowMs: broker.nowMs,
    forceFlatLeadMin: broker.symbol.forceFlatLeadMin,
    preNewsFlattenLeadMin: broker.symbol.preNewsFlattenLeadMin,
    ...(broker.marketCloseAtMs !== undefined ? { marketCloseAtMs: broker.marketCloseAtMs } : {}),
    ...(broker.fridayCloseAtMs !== undefined ? { fridayCloseAtMs: broker.fridayCloseAtMs } : {}),
    ...(next !== null ? { nextRestrictedEventAtMs: next.eventAtMs } : {}),
  });

  return logDecision(intent, ctx, {
    rail: 'force_flat_schedule',
    outcome: inside.inside ? 'reject' : 'allow',
    reason: inside.inside
      ? (inside.reason ?? 'inside force-flat window')
      : 'outside all force-flat windows',
    detail: {
      forceFlatLeadMin: broker.symbol.forceFlatLeadMin,
      preNewsFlattenLeadMin: broker.symbol.preNewsFlattenLeadMin,
      windowAtMs: inside.windowAtMs,
      marketCloseAtMs: broker.marketCloseAtMs,
      fridayCloseAtMs: broker.fridayCloseAtMs,
      nextRestrictedEventAtMs: next?.eventAtMs,
    },
    decidedAt,
  });
}
