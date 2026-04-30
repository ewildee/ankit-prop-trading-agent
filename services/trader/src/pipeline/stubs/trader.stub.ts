import type { TraderOutput } from '@ankit-prop/contracts';
import type { TraderStage } from '../stages.ts';

const ZERO_CACHE_STATS = {
  inputCachedTokens: 0,
  inputFreshTokens: 0,
  inputCacheWriteTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
} as const;

export function createTraderStub(): TraderStage {
  return {
    decide(): TraderOutput {
      return {
        action: 'HOLD',
        rationale: 'stub',
        reason: 'stub',
        cacheStats: ZERO_CACHE_STATS,
      };
    },
  };
}
