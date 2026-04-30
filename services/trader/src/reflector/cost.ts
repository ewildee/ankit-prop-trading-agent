import type { CacheLayerStats, DecisionRecord, RunLlmCostUsd } from '@ankit-prop/contracts';
import { priceCacheStatsAsClaudeSonnet45 } from './claude-pricing.ts';

const ZERO_CACHE_STATS: CacheLayerStats = {
  inputCachedTokens: 0,
  inputFreshTokens: 0,
  inputCacheWriteTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
};

export function summarizeLlmCost(records: ReadonlyArray<DecisionRecord>): RunLlmCostUsd {
  const fallbackStats = { ...ZERO_CACHE_STATS };
  let authoritativeTotalUsd = 0;
  for (const record of records) {
    authoritativeTotalUsd += addStageCostOrFallback(
      fallbackStats,
      record.analystOutput.costUsd,
      record.analystOutput.cacheStats,
    );
    authoritativeTotalUsd += addStageCostOrFallback(
      fallbackStats,
      record.traderOutput.costUsd,
      record.traderOutput.cacheStats,
    );
    if (record.judgeOutput) {
      authoritativeTotalUsd += addStageCostOrFallback(
        fallbackStats,
        record.judgeOutput.costUsd,
        record.judgeOutput.cacheStats,
      );
    }
  }
  const fallback = priceCacheStatsAsClaudeSonnet45(fallbackStats);
  return {
    ...fallback,
    totalUsd: authoritativeTotalUsd + fallback.totalUsd,
  };
}

function addStageCostOrFallback(
  target: CacheLayerStats,
  costUsd: number | undefined,
  cacheStats: CacheLayerStats,
): number {
  if (costUsd !== undefined) return costUsd;
  addCacheStats(target, cacheStats);
  return 0;
}

function addCacheStats(target: CacheLayerStats, source: CacheLayerStats): void {
  target.inputCachedTokens += source.inputCachedTokens;
  target.inputFreshTokens += source.inputFreshTokens;
  target.inputCacheWriteTokens += source.inputCacheWriteTokens;
  target.outputTokens += source.outputTokens;
  target.thinkingTokens += source.thinkingTokens;
}
