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
  const total = { ...ZERO_CACHE_STATS };
  for (const record of records) {
    addCacheStats(total, record.analystOutput.cacheStats);
    addCacheStats(total, record.traderOutput.cacheStats);
    if (record.judgeOutput) addCacheStats(total, record.judgeOutput.cacheStats);
  }
  return priceCacheStatsAsClaudeSonnet45(total);
}

function addCacheStats(target: CacheLayerStats, source: CacheLayerStats): void {
  target.inputCachedTokens += source.inputCachedTokens;
  target.inputFreshTokens += source.inputFreshTokens;
  target.inputCacheWriteTokens += source.inputCacheWriteTokens;
  target.outputTokens += source.outputTokens;
  target.thinkingTokens += source.thinkingTokens;
}
