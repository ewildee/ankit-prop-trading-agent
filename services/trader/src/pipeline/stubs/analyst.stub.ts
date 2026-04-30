import type { AnalystOutput } from '@ankit-prop/contracts';
import type { AnalystStage } from '../stages.ts';

const ZERO_CACHE_STATS = {
  inputCachedTokens: 0,
  inputFreshTokens: 0,
  inputCacheWriteTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
} as const;

export function createAnalystStub(): AnalystStage {
  return {
    analyze(): AnalystOutput {
      return {
        thesis: 'Stub analyst emits neutral thesis until Analyst v0 lands.',
        bias: 'neutral',
        confidence: 0,
        confluenceScore: 0,
        keyLevels: [],
        regimeLabel: 'unknown',
        regimeNote: 'stub',
        cacheStats: ZERO_CACHE_STATS,
      };
    },
  };
}
