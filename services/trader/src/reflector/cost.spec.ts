import { describe, expect, test } from 'bun:test';
import { summarizeLlmCost } from './cost.ts';
import {
  fixtureDecision,
  holdOutput,
  notSubmittedHoldGateway,
  ONE_MILLION_EACH_CACHE_STATS,
  ZERO_CACHE_STATS,
} from './test-fixtures.ts';

describe('summarizeLlmCost', () => {
  test('prices stage cacheStats with the frozen Claude Sonnet 4.5 rate snapshot', () => {
    const traderOutput = holdOutput();
    const cost = summarizeLlmCost([
      fixtureDecision({
        decisionId: 'cost-decision',
        analystOutput: {
          thesis: 'XAUUSD has a fixture thesis long enough to satisfy the contract boundary.',
          bias: 'neutral',
          confidence: 0.5,
          confluenceScore: 50,
          keyLevels: [{ name: 'fixture', price: 2332.1, timeframe: '5m' }],
          regimeLabel: 'unknown',
          regimeNote: 'fixture',
          cacheStats: ONE_MILLION_EACH_CACHE_STATS,
        },
        traderOutput: { ...traderOutput, cacheStats: ZERO_CACHE_STATS },
        gatewayDecision: notSubmittedHoldGateway(traderOutput),
      }),
    ]);

    expect(cost).toEqual({
      inputCachedUsd: 0.3,
      inputFreshUsd: 3,
      inputCacheWriteUsd: 3.75,
      outputUsd: 15,
      thinkingUsd: 15,
      totalUsd: 37.05,
    });
  });
});
