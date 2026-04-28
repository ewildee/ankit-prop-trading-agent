// Rail 7 — post-fill slippage guard (BLUEPRINT §9, decision X).
// Close immediately if filled beyond `max(2 × typical_spread, 0.5 × ATR(14))`.
// In our model the rail returns `reject` for the originating NEW intent;
// the gateway then queues a ProtoOAClosePositionReq for the just-filled position.
//
// Rail 7 is post-fill-only (see evaluator.ts POST_FILL_RAIL_KEYS). Reaching
// the rail with `intent.kind !== 'NEW'`, `broker.fill === undefined`, or a
// fill whose `filledPrice` / `intendedPrice` is missing or non-finite is a
// dispatcher / broker invariant violation. Per BLUEPRINT §3.5 fail-closed
// defaults ("default for any uncertainty: fail closed. No trades > wrong
// trades."), every branch returns `reject` rather than masking the upstream
// defect by allowing the just-opened position to remain open without a
// slippage check. ANKA-40 closed the missing-fill / non-NEW gaps; ANKA-58
// closes the residual malformed-fill gap where `Math.abs(NaN) > cap` would
// otherwise have evaluated to `false` and silently returned `allow`.

import type { RailDecision } from '@ankit-prop/contracts';
import { logDecision } from './log-decision.ts';
import { isoNow, type RailContext, type RailIntent } from './types.ts';

export function evaluateSlippageGuard(intent: RailIntent, ctx: RailContext): RailDecision {
  const { broker, config } = ctx;
  const decidedAt = isoNow(broker.nowMs);

  if (intent.kind !== 'NEW') {
    return logDecision(intent, ctx, {
      rail: 'slippage_guard',
      outcome: 'reject',
      reason: `rail 7 invoked with non-NEW intent kind=${intent.kind} — fail closed`,
      detail: { intentKind: intent.kind, hasFill: broker.fill !== undefined },
      decidedAt,
    });
  }

  if (broker.fill === undefined) {
    return logDecision(intent, ctx, {
      rail: 'slippage_guard',
      outcome: 'reject',
      reason: 'rail 7 invoked on post-fill path without fill report — fail closed',
      detail: { intentKind: intent.kind, hasFill: false },
      decidedAt,
    });
  }

  const { filledPrice, intendedPrice } = broker.fill;
  if (!Number.isFinite(filledPrice) || !Number.isFinite(intendedPrice)) {
    return logDecision(intent, ctx, {
      rail: 'slippage_guard',
      outcome: 'reject',
      reason: 'rail 7 malformed fill report — fail closed',
      detail: {
        intentKind: intent.kind,
        hasFill: true,
        filledPrice,
        intendedPrice,
      },
      decidedAt,
    });
  }

  const slippage = Math.abs(filledPrice - intendedPrice);
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
