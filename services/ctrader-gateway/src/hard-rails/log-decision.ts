import type { RailDecision } from '@ankit-prop/contracts';
import type { RailContext, RailIntent } from './types.ts';

// Common §9 logging shape: {rail, symbol, outcome, reason, accountId, envelopeId,
// clientOrderId, detail}. `warn` is reserved for `reject` outcomes so production
// pino streams can alert on warn+ without a separate filter.
export function logDecision(
  intent: RailIntent,
  ctx: RailContext,
  decision: RailDecision,
): RailDecision {
  const payload = {
    rail: decision.rail,
    symbol: intent.symbol,
    outcome: decision.outcome,
    reason: decision.reason,
    accountId: intent.accountId,
    envelopeId: intent.envelopeId,
    clientOrderId: intent.clientOrderId,
    detail: decision.detail,
  };
  if (decision.outcome === 'reject') {
    ctx.logger.warn(payload);
  } else {
    ctx.logger.info(payload);
  }
  return decision;
}
