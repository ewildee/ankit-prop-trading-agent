import type { JudgeOutput } from '@ankit-prop/contracts';
import type { JudgeStage } from '../stages.ts';

const ZERO_CACHE_STATS = {
  inputCachedTokens: 0,
  inputFreshTokens: 0,
  inputCacheWriteTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
} as const;

export function createJudgeStub(): JudgeStage {
  return {
    evaluate(): JudgeOutput {
      return {
        verdict: 'REJECT',
        reason: 'stub',
        rejectedRules: [],
        cacheStats: ZERO_CACHE_STATS,
      };
    },
  };
}
