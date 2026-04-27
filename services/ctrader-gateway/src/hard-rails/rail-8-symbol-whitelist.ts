// Rail 8 — symbol whitelist (BLUEPRINT §9). Only enabled instruments per
// `accounts.yaml` may transact. CLOSE intents are still allowed even when a
// symbol is later disabled — operator must be able to flatten leftover
// positions without re-enabling the symbol.

import type { RailDecision } from '@ankit-prop/contracts';
import { logDecision } from './log-decision.ts';
import { isoNow, type RailContext, type RailIntent } from './types.ts';

export function evaluateSymbolWhitelist(intent: RailIntent, ctx: RailContext): RailDecision {
  const { broker } = ctx;
  const decidedAt = isoNow(broker.nowMs);

  if (intent.kind === 'CLOSE') {
    return logDecision(intent, ctx, {
      rail: 'symbol_whitelist',
      outcome: 'allow',
      reason: 'CLOSE always permitted to flatten residual positions',
      detail: { intentKind: intent.kind, symbol: intent.symbol },
      decidedAt,
    });
  }

  const matchesContext = broker.symbol.symbol === intent.symbol;
  const allowed = matchesContext && broker.symbol.enabled;
  return logDecision(intent, ctx, {
    rail: 'symbol_whitelist',
    outcome: allowed ? 'allow' : 'reject',
    reason: allowed
      ? 'symbol enabled in whitelist'
      : `symbol ${intent.symbol} not enabled (matches=${matchesContext}, enabled=${broker.symbol.enabled})`,
    detail: {
      symbol: intent.symbol,
      contextSymbol: broker.symbol.symbol,
      enabled: broker.symbol.enabled,
    },
    decidedAt,
  });
}
