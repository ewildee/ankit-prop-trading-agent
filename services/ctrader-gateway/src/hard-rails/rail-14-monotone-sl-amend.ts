// Rail 14 — AMEND monotone-SL invariant (BLUEPRINT §9, decision E + BB).
// Reject any AMEND that loosens the SL.
//   BUY  position: SL is below entry; tightening means SL moves UP   (newSL >= prevSL)
//   SELL position: SL is above entry; tightening means SL moves DOWN (newSL <= prevSL)

import type { RailDecision } from '@ankit-prop/contracts';
import { logDecision } from './log-decision.ts';
import { isoNow, type RailContext, type RailIntent } from './types.ts';

export function evaluateMonotoneSlAmend(intent: RailIntent, ctx: RailContext): RailDecision {
  const { broker } = ctx;
  const decidedAt = isoNow(broker.nowMs);

  if (intent.kind !== 'AMEND') {
    return logDecision(intent, ctx, {
      rail: 'monotone_sl_amend',
      outcome: 'allow',
      reason: `${intent.kind} not subject to monotone-SL invariant`,
      detail: { intentKind: intent.kind },
      decidedAt,
    });
  }

  const tightens =
    intent.side === 'BUY'
      ? intent.newStopLossPrice >= intent.prevStopLossPrice
      : intent.newStopLossPrice <= intent.prevStopLossPrice;

  return logDecision(intent, ctx, {
    rail: 'monotone_sl_amend',
    outcome: tightens ? 'allow' : 'reject',
    reason: tightens
      ? `AMEND tightens SL ${intent.prevStopLossPrice.toFixed(5)} → ${intent.newStopLossPrice.toFixed(5)}`
      : `AMEND loosens SL ${intent.prevStopLossPrice.toFixed(5)} → ${intent.newStopLossPrice.toFixed(5)} — rejected`,
    detail: {
      side: intent.side,
      prevStopLossPrice: intent.prevStopLossPrice,
      newStopLossPrice: intent.newStopLossPrice,
      positionId: intent.positionId,
    },
    decidedAt,
  });
}
