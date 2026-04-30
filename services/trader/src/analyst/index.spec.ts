import { describe, expect, test } from 'bun:test';
import type { AnalystOutput } from '@ankit-prop/contracts';
import type { Bar } from '@ankit-prop/market-data';
import type { LanguageModelUsage, ProviderMetadata } from 'ai';
import { loadPersonaConfig } from '../persona-config/loader.ts';
import type { AnalystGenerationRequest } from './index.ts';
import {
  buildOpenRouterAnalystProviderOptions,
  createVAnkitClassicAnalyst,
  openRouterCostUsdFromProviderMetadata,
} from './index.ts';

type AnalystGenerationDraft = Omit<
  AnalystOutput,
  'confidence' | 'confluenceScore' | 'regimeLabel' | 'regimeNote' | 'cacheStats'
>;

describe('createVAnkitClassicAnalyst', () => {
  test('calls OpenRouter-shaped generator and overlays deterministic regime, score, and usage', async () => {
    const params = await loadPersonaConfig();
    const requests: AnalystGenerationRequest[] = [];
    const analyst = createVAnkitClassicAnalyst({
      generator: async (request) => {
        requests.push(request);
        return {
          object: draftOutput(),
          usage: usageFixture(),
          providerMetadata: openRouterUsageCostFixture(0.012345),
        };
      },
    });

    let output: AnalystOutput | undefined;
    for (const bar of barsFromCloses([2300, 2300.2, 2300.3, 2300.45, 2301.2, 2303.4])) {
      output = await analyst.analyze({
        bar,
        persona: params,
        context: {
          runId: 'analyst-index-spec',
          paramsHash: 'params-hash',
          decidedAt: new Date(bar.tsEnd).toISOString(),
        },
      });
    }

    expect(requests.length).toBe(6);
    expect(requests.at(-1)?.model).toBe('moonshotai/kimi-k2.6');
    expect(requests.at(-1)?.reasoningMaxTokens).toBe(params.analyst.reasoningMaxTokens);
    expect(requests.at(-1)?.system).toContain('v_ankit_classic');
    expect(requests.at(-1)?.prompt).toContain('calendarLookahead');
    expect(requests.at(-1)?.prompt).toContain('Do not include regimeLabel');
    expect(output?.regimeLabel).toBe('A_session_break');
    expect(output?.confidence).toBe(output?.confluenceScore ? output.confluenceScore / 100 : 0);
    expect(output?.cacheStats).toEqual({
      inputCachedTokens: 10,
      inputFreshTokens: 80,
      inputCacheWriteTokens: 5,
      outputTokens: 40,
      thinkingTokens: 7,
    });
    expect(output?.costUsd).toBe(0.012345);
  });

  test('extracts OpenRouter credits-USD usage cost from provider metadata', () => {
    expect(openRouterCostUsdFromProviderMetadata(openRouterUsageCostFixture(0.009876))).toBe(
      0.009876,
    );
    expect(openRouterCostUsdFromProviderMetadata(undefined)).toBeUndefined();
  });

  test('passes params-sourced reasoning cap through OpenRouter provider options', async () => {
    const params = await loadPersonaConfig();
    const reasoningMaxTokens = params.analyst.reasoningMaxTokens;
    if (reasoningMaxTokens === undefined) throw new Error('test params missing reasoningMaxTokens');
    const options = buildOpenRouterAnalystProviderOptions({
      model: params.analyst.model,
      maxOutputTokens: params.analyst.maxOutputTokens,
      reasoningMaxTokens,
      system: 'system',
      prompt: 'prompt',
    });

    expect(options.openrouter.reasoning).toEqual({
      max_tokens: reasoningMaxTokens,
      exclude: true,
    });
  });

  test('malformed generator output fails with structured validation detail before overlay', async () => {
    const params = await loadPersonaConfig();
    const analyst = createVAnkitClassicAnalyst({
      generator: async () => ({
        object: {
          ...draftOutput(),
          bias: 'sideways',
          thesis: undefined,
        },
        usage: usageFixture(),
      }),
    });
    const bar = barsFromCloses([2300]).at(-1)!;

    await expect(
      analyst.analyze({
        bar,
        persona: params,
        context: {
          runId: 'analyst-index-spec',
          paramsHash: 'params-hash',
          decidedAt: new Date(bar.tsEnd).toISOString(),
        },
      }),
    ).rejects.toThrow(/Analyst generation output validation failed.*thesis.*bias/);
  });

  test('rejects unknown generator keys instead of silently normalizing provider output', async () => {
    const params = await loadPersonaConfig();
    const analyst = createVAnkitClassicAnalyst({
      generator: async () => ({
        object: {
          ...draftOutput(),
          '': 'malformed-provider-key',
        },
        usage: usageFixture(),
      }),
    });
    const bar = barsFromCloses([2300]).at(-1)!;

    await expect(
      analyst.analyze({
        bar,
        persona: params,
        context: {
          runId: 'analyst-index-spec',
          paramsHash: 'params-hash',
          decidedAt: new Date(bar.tsEnd).toISOString(),
        },
      }),
    ).rejects.toThrow(/Analyst generation output validation failed.*unrecognized_keys/);
  });

  test('maps aggregate-only usage telemetry without token detail objects', async () => {
    const params = await loadPersonaConfig();
    const analyst = createVAnkitClassicAnalyst({
      generator: async () => ({
        object: draftOutput(),
        usage: {
          inputTokens: 95,
          outputTokens: 40,
          totalTokens: 135,
        } as unknown as LanguageModelUsage,
      }),
    });
    const bar = barsFromCloses([2300]).at(-1)!;

    const output = await analyst.analyze({
      bar,
      persona: params,
      context: {
        runId: 'analyst-index-spec',
        paramsHash: 'params-hash',
        decidedAt: new Date(bar.tsEnd).toISOString(),
      },
    });

    expect(output.cacheStats).toEqual({
      inputCachedTokens: 0,
      inputFreshTokens: 95,
      inputCacheWriteTokens: 0,
      outputTokens: 40,
      thinkingTokens: 0,
    });
  });
});

function draftOutput(): AnalystGenerationDraft {
  return {
    thesis:
      'XAUUSD is breaking above the session range with enough momentum to keep a long bias active.',
    bias: 'long',
    keyLevels: [{ name: 'session high', price: 2303.4, timeframe: '5m' }],
    reasoningSummary: 'Session break and momentum agree.',
    supportingEvidence: 'Latest close is near the top of the supplied range.',
  };
}

function usageFixture(): LanguageModelUsage {
  return {
    inputTokens: 95,
    inputTokenDetails: {
      noCacheTokens: 80,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
    },
    outputTokens: 40,
    outputTokenDetails: {
      textTokens: 33,
      reasoningTokens: 7,
    },
    totalTokens: 135,
  };
}

function openRouterUsageCostFixture(cost: number): ProviderMetadata {
  return {
    openrouter: {
      usage: {
        cost,
      },
    },
  } as unknown as ProviderMetadata;
}

function barsFromCloses(closes: number[]): Bar[] {
  const start = Date.parse('2026-04-30T12:10:00.000Z');
  return closes.map((close, index) => ({
    symbol: 'XAUUSD',
    timeframe: '5m',
    tsStart: start + index * 300_000,
    tsEnd: start + (index + 1) * 300_000,
    open: close - 0.2,
    high: close + 0.3,
    low: close - 0.4,
    close,
    volume: 1000 + index,
  }));
}
