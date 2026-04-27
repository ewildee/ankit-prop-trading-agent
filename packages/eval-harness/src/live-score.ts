import { emptyCostBreakdown } from './cost.ts';
import { computeMetrics, emptyMetrics } from './metrics.ts';
import type { ClosedTrade, EvalResult, FtmoBreach } from './types.ts';

export type LiveScoreInput = {
  accountId: string;
  envelopeId?: string | null;
  initialCapital: number;
  sinceMs: number;
  trades: ReadonlyArray<ClosedTrade>;
  observedBreaches?: ReadonlyArray<FtmoBreach>;
};

export function liveScore(input: LiveScoreInput): EvalResult {
  const trades = input.trades.filter((t) => t.closedAt >= input.sinceMs);
  if (trades.length === 0) {
    return {
      metrics: emptyMetrics(),
      ftmoBreaches: [...(input.observedBreaches ?? [])],
      costBreakdown: emptyCostBreakdown(),
      diagnostics: {
        accountId: input.accountId,
        sinceMs: input.sinceMs,
        tradeCount: 0,
      },
    };
  }
  const lastTs = trades.reduce((m, t) => Math.max(m, t.closedAt), 0);
  const metrics = computeMetrics(input.initialCapital, trades, lastTs);
  return {
    metrics,
    ftmoBreaches: [...(input.observedBreaches ?? [])],
    costBreakdown: emptyCostBreakdown(),
    diagnostics: {
      accountId: input.accountId,
      sinceMs: input.sinceMs,
      tradeCount: trades.length,
    },
  };
}
