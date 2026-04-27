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

  // BLUEPRINT §3.5 — defense-in-depth fail-closed (ANKA-27 / ANKA-19 review B-2).
  // BrokerSnapshot.marketCloseAtMs is now required at the type level, but a
  // future Zod boundary parse (ANKA-15) or a malformed reconciliation must not
  // silently disable rail 13. If every schedule anchor is missing we cannot
  // know whether a NEW order is inside the force-flat window, so we reject.
  // A bare `as` cast keeps this branch reachable even after the static type
  // narrows the field to `number`.
  const marketCloseAtMs = (broker as { marketCloseAtMs?: number }).marketCloseAtMs;
  const fridayCloseAtMs = broker.fridayCloseAtMs;
  const next = news.nextRestrictedEvent(intent.symbol, broker.nowMs);
  if (marketCloseAtMs === undefined && fridayCloseAtMs === undefined && next === null) {
    return logDecision(intent, ctx, {
      rail: 'force_flat_schedule',
      outcome: 'reject',
      reason: 'force-flat schedule unknown — fail-closed',
      detail: {
        forceFlatLeadMin: broker.symbol.forceFlatLeadMin,
        preNewsFlattenLeadMin: broker.symbol.preNewsFlattenLeadMin,
        marketCloseAtMs,
        fridayCloseAtMs,
        nextRestrictedEventAtMs: null,
      },
      decidedAt,
    });
  }

  const inside = isInsideForceFlatWindow({
    nowMs: broker.nowMs,
    forceFlatLeadMin: broker.symbol.forceFlatLeadMin,
    preNewsFlattenLeadMin: broker.symbol.preNewsFlattenLeadMin,
    ...(marketCloseAtMs !== undefined ? { marketCloseAtMs } : {}),
    ...(fridayCloseAtMs !== undefined ? { fridayCloseAtMs } : {}),
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
      marketCloseAtMs,
      fridayCloseAtMs,
      nextRestrictedEventAtMs: next?.eventAtMs,
    },
    decidedAt,
  });
}
