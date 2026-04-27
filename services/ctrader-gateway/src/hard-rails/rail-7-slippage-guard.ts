// Rail 7 — post-fill slippage guard (BLUEPRINT §9, decision X).
// Close immediately if filled beyond `max(2 × typical_spread, 0.5 × ATR(14))`.
// In our model the rail returns `reject` for the originating NEW intent;
// the gateway then queues a ProtoOAClosePositionReq for the just-filled position.

import type { RailDecision } from '@ankit-prop/contracts';
import { logDecision } from './log-decision.ts';
import { isoNow, type RailContext, type RailIntent } from './types.ts';

export function evaluateSlippageGuard(intent: RailIntent, ctx: RailContext): RailDecision {
  const { broker, config } = ctx;
  const decidedAt = isoNow(broker.nowMs);

  if (intent.kind !== 'NEW' || broker.fill === undefined) {
    return logDecision(intent, ctx, {
      rail: 'slippage_guard',
      outcome: 'allow',
      reason: 'not a post-fill check',
      detail: { intentKind: intent.kind, hasFill: broker.fill !== undefined },
      decidedAt,
    });
  }

  const slippage = Math.abs(broker.fill.filledPrice - broker.fill.intendedPrice);
  const cap = Math.max(
    config.slippageSpreadMultiplier * broker.symbol.typicalSpread,
    config.slippageMinAtrFraction * broker.symbol.atr14,
  );
  const exceeds = slippage > cap;
  return logDecision(intent, ctx, {
    rail: 'slippage_guard',
    outcome: exceeds ? 'reject' : 'allow',
    reason: exceeds
      ? `slippage ${slippage.toFixed(5)} > cap ${cap.toFixed(5)} — close immediately`
      : `slippage ${slippage.toFixed(5)} within cap ${cap.toFixed(5)}`,
    detail: {
      slippage,
      cap,
      typicalSpread: broker.symbol.typicalSpread,
      atr14: broker.symbol.atr14,
    },
    decidedAt,
  });
}
