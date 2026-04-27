// Rail 4 — 2-h pre-news kill-switch (BLUEPRINT §9, §11.5).
// No new entries within 2 h of a tier-1 event (impact === 'high' OR
// restriction === true, decision Y). AMEND and CLOSE are allowed.

import type { RailDecision } from '@ankit-prop/contracts';
import { logDecision } from './log-decision.ts';
import { isoNow, type RailContext, type RailIntent } from './types.ts';

export function evaluateNewsPreKill(intent: RailIntent, ctx: RailContext): RailDecision {
  const { broker, news, config } = ctx;
  const decidedAt = isoNow(broker.nowMs);

  if (intent.kind !== 'NEW') {
    return logDecision(intent, ctx, {
      rail: 'news_pre_kill_2h',
      outcome: 'allow',
      reason: `${intent.kind} not subject to 2-h pre-news kill-switch`,
      detail: { intentKind: intent.kind },
      decidedAt,
    });
  }

  const ageMs = news.lastFetchAgeMs(broker.nowMs);
  if (ageMs > config.newsStaleMaxMs) {
    return logDecision(intent, ctx, {
      rail: 'news_pre_kill_2h',
      outcome: 'reject',
      reason: `news stale ${Math.floor(ageMs / 1000)}s — fail-closed`,
      detail: { lastFetchAgeMs: ageMs, newsStaleMaxMs: config.newsStaleMaxMs },
      decidedAt,
    });
  }

  const { blocked, reason } = news.isInPreNewsKill(intent.symbol, broker.nowMs);
  return logDecision(intent, ctx, {
    rail: 'news_pre_kill_2h',
    outcome: blocked ? 'reject' : 'allow',
    reason: blocked ? (reason ?? 'tier-1 event within 2h') : 'no tier-1 event within 2h',
    detail: { lastFetchAgeMs: ageMs },
    decidedAt,
  });
}
