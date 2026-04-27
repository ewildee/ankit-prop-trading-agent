// Rail 6 — spread guard (BLUEPRINT §9). Per-symbol multiplier vs typical spread.
// Applies to NEW entries only — once a position exists, AMEND/CLOSE proceed
// regardless of current spread.

import type { RailDecision } from '@ankit-prop/contracts';
import { logDecision } from './log-decision.ts';
import { isoNow, type RailContext, type RailIntent } from './types.ts';

export function evaluateSpreadGuard(intent: RailIntent, ctx: RailContext): RailDecision {
  const { broker } = ctx;
  const decidedAt = isoNow(broker.nowMs);

  if (intent.kind !== 'NEW') {
    return logDecision(intent, ctx, {
      rail: 'spread_guard',
      outcome: 'allow',
      reason: `${intent.kind} not subject to spread guard`,
      detail: { intentKind: intent.kind },
      decidedAt,
    });
  }

  if (broker.bid === undefined || broker.ask === undefined) {
    return logDecision(intent, ctx, {
      rail: 'spread_guard',
      outcome: 'reject',
      reason: 'bid/ask unavailable — fail-closed',
      detail: {},
      decidedAt,
    });
  }

  const spread = broker.ask - broker.bid;
  const cap = broker.symbol.typicalSpread * broker.symbol.spreadGuardMultiplier;
  const tooWide = spread > cap;
  return logDecision(intent, ctx, {
    rail: 'spread_guard',
    outcome: tooWide ? 'reject' : 'allow',
    reason: tooWide
      ? `spread ${spread.toFixed(5)} > cap ${cap.toFixed(5)} (typical=${broker.symbol.typicalSpread} × ${broker.symbol.spreadGuardMultiplier})`
      : `spread ${spread.toFixed(5)} within cap ${cap.toFixed(5)}`,
    detail: {
      spread,
      typicalSpread: broker.symbol.typicalSpread,
      multiplier: broker.symbol.spreadGuardMultiplier,
      cap,
    },
    decidedAt,
  });
}
