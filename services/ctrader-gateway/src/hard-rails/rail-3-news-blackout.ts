// Rail 3 — ±5-min news blackout (BLUEPRINT §9, §11.5 decision M.1, all phases).
// Re-queries svc:news per instrument; AMEND and CLOSE are allowed during the
// window (you may need to defend an existing position). Fail-closed when the
// calendar is stale beyond `newsStaleMaxMs` (BLUEPRINT §11.7). Per ANKA-31
// (REVIEW-FINDINGS H-5) the rail layer — not the client — owns the staleness
// comparison: a faulty `svc:news` HTTP client cannot lie about freshness by
// reporting age=0 after a failed fetch, because the client only surfaces
// `lastSuccessfulFetchAtMs()` and the rail does the math against `broker.nowMs`.

import type { RailDecision } from '@ankit-prop/contracts';
import { logDecision } from './log-decision.ts';
import { isoNow, type RailContext, type RailIntent } from './types.ts';

export const NEWS_NEVER_FETCHED_REASON =
  'news client has never reported a successful fetch — fail-closed' as const;

export function evaluateNewsBlackout(intent: RailIntent, ctx: RailContext): RailDecision {
  const { broker, news, config } = ctx;
  const decidedAt = isoNow(broker.nowMs);

  if (intent.kind !== 'NEW') {
    return logDecision(intent, ctx, {
      rail: 'news_blackout_5m',
      outcome: 'allow',
      reason: `${intent.kind} not subject to ±5-min blackout`,
      detail: { intentKind: intent.kind },
      decidedAt,
    });
  }

  const lastFetchAtMs = news.lastSuccessfulFetchAtMs();
  if (lastFetchAtMs === null) {
    return logDecision(intent, ctx, {
      rail: 'news_blackout_5m',
      outcome: 'reject',
      reason: NEWS_NEVER_FETCHED_REASON,
      detail: { lastSuccessfulFetchAtMs: null, newsStaleMaxMs: config.newsStaleMaxMs },
      decidedAt,
    });
  }
  const ageMs = broker.nowMs - lastFetchAtMs;
  if (ageMs > config.newsStaleMaxMs) {
    return logDecision(intent, ctx, {
      rail: 'news_blackout_5m',
      outcome: 'reject',
      reason: `news stale ${Math.floor(ageMs / 1000)}s > ${Math.floor(config.newsStaleMaxMs / 1000)}s — fail-closed`,
      detail: {
        lastSuccessfulFetchAtMs: lastFetchAtMs,
        ageMs,
        newsStaleMaxMs: config.newsStaleMaxMs,
      },
      decidedAt,
    });
  }

  const { blocked, reason } = news.isInBlackout(intent.symbol, broker.nowMs);
  return logDecision(intent, ctx, {
    rail: 'news_blackout_5m',
    outcome: blocked ? 'reject' : 'allow',
    reason: blocked ? (reason ?? 'in ±5-min blackout window') : 'no restricted event nearby',
    detail: { lastSuccessfulFetchAtMs: lastFetchAtMs, ageMs },
    decidedAt,
  });
}
