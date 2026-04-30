import type { CacheLayerStats, RunLlmCostUsd } from '@ankit-prop/contracts';

export type ClaudePricingModel = 'claude-sonnet-4.5';

export type ClaudePricingPerMillionTokens = {
  readonly inputCachedUsd: number;
  readonly inputFreshUsd: number;
  readonly inputCacheWriteUsd: number;
  readonly outputUsd: number;
  readonly thinkingUsd: number;
};

// Source: https://docs.claude.com/en/docs/about-claude/pricing captured 2026-04-30.
// Claude Sonnet 4.5: base input $3/MTok, 5m cache write $3.75/MTok,
// cache read $0.30/MTok, output $15/MTok. Thinking tokens are billed as output.
export const CLAUDE_SONNET_4_5_PRICING_PER_MILLION: ClaudePricingPerMillionTokens = {
  inputCachedUsd: 0.3,
  inputFreshUsd: 3,
  inputCacheWriteUsd: 3.75,
  outputUsd: 15,
  thinkingUsd: 15,
} as const;

export const CLAUDE_PRICING_BY_MODEL: Record<ClaudePricingModel, ClaudePricingPerMillionTokens> = {
  'claude-sonnet-4.5': CLAUDE_SONNET_4_5_PRICING_PER_MILLION,
} as const;

const TOKENS_PER_MILLION = 1_000_000;

export function priceCacheStatsAsClaudeSonnet45(
  stats: CacheLayerStats,
  pricing = CLAUDE_SONNET_4_5_PRICING_PER_MILLION,
): RunLlmCostUsd {
  const inputCachedUsd = tokenCost(stats.inputCachedTokens, pricing.inputCachedUsd);
  const inputFreshUsd = tokenCost(stats.inputFreshTokens, pricing.inputFreshUsd);
  const inputCacheWriteUsd = tokenCost(stats.inputCacheWriteTokens, pricing.inputCacheWriteUsd);
  const outputUsd = tokenCost(stats.outputTokens, pricing.outputUsd);
  const thinkingUsd = tokenCost(stats.thinkingTokens, pricing.thinkingUsd);
  return {
    inputCachedUsd,
    inputFreshUsd,
    inputCacheWriteUsd,
    outputUsd,
    thinkingUsd,
    totalUsd: inputCachedUsd + inputFreshUsd + inputCacheWriteUsd + outputUsd + thinkingUsd,
  };
}

function tokenCost(tokens: number, usdPerMillion: number): number {
  return (tokens * usdPerMillion) / TOKENS_PER_MILLION;
}
