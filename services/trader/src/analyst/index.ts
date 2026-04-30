import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AnalystOutput,
  type AnalystOutput as AnalystOutputType,
  type CacheLayerStats,
  type CalendarItem,
} from '@ankit-prop/contracts';
import type { Bar } from '@ankit-prop/market-data';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject, type LanguageModelUsage, type ProviderMetadata } from 'ai';
import type { AnalystStage, AnalystStageInput } from '../pipeline/stages.ts';
import { scoreConfluence } from './confluence-score.ts';
import { ZERO } from './constants.ts';
import { classifyRegime } from './regime-classifier.ts';

const SERVICE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ANALYST_PROMPT_PATH = resolve(
  SERVICE_ROOT,
  'strategy',
  'v_ankit_classic',
  'prompts',
  'analyst.md',
);
const AnalystGenerationOutput = AnalystOutput.omit({
  confidence: true,
  confluenceScore: true,
  regimeLabel: true,
  regimeNote: true,
  cacheStats: true,
  costUsd: true,
});

export type AnalystGenerationRequest = {
  readonly model: string;
  readonly maxOutputTokens: number;
  readonly reasoningMaxTokens?: number;
  readonly system: string;
  readonly prompt: string;
};

export type AnalystGenerationResult = {
  readonly object: unknown;
  readonly usage: LanguageModelUsage;
  readonly providerMetadata?: ProviderMetadata;
};

export type AnalystGenerator = (
  request: AnalystGenerationRequest,
) => Promise<AnalystGenerationResult>;

export type CreateVAnkitClassicAnalystOptions = {
  readonly generator?: AnalystGenerator;
  readonly apiKey?: string;
  readonly promptPath?: string;
};

export function createVAnkitClassicAnalyst(
  options: CreateVAnkitClassicAnalystOptions = {},
): AnalystStage {
  const recentBars: Bar[] = [];
  const generator = options.generator ?? createOpenRouterAnalystGenerator(options.apiKey);
  const promptPath = options.promptPath ?? ANALYST_PROMPT_PATH;

  return {
    async analyze(input: AnalystStageInput): Promise<AnalystOutputType> {
      if (input.persona.personaId !== 'v_ankit_classic') {
        throw new Error(`unsupported analyst persona: ${input.persona.personaId}`);
      }

      recentBars.push(input.bar);
      const series = recentBars.slice(-input.persona.analyst.barLookback);
      const calendarLookahead: CalendarItem[] = [];
      const regimeLabel = classifyRegime({
        bar: input.bar,
        recentBars: series,
        calendarLookahead,
        params: input.persona,
      });
      const confluence = scoreConfluence({
        regimeLabel,
        recentBars: series,
        params: input.persona,
      });
      const staticPrompt = await readFile(promptPath, 'utf8');
      const generation = await generator({
        model: input.persona.analyst.model,
        maxOutputTokens: input.persona.analyst.maxOutputTokens,
        system: staticPrompt,
        prompt: buildAnalystPrompt({
          input,
          recentBars: series,
          regimeLabel,
          confluence,
          calendarLookahead,
        }),
        ...(input.persona.analyst.reasoningMaxTokens
          ? { reasoningMaxTokens: input.persona.analyst.reasoningMaxTokens }
          : {}),
      });

      const parsedGeneration = AnalystGenerationOutput.safeParse(generation.object);
      if (!parsedGeneration.success) {
        throw new Error(
          `Analyst generation output validation failed: ${JSON.stringify(parsedGeneration.error.issues)}`,
        );
      }

      const parsed = AnalystOutput.safeParse({
        ...parsedGeneration.data,
        regimeLabel,
        confidence: confluence.confidence,
        confluenceScore: confluence.score,
        regimeNote: confluence.regimeNote,
        cacheStats: cacheStatsFromUsage(generation.usage),
        costUsd: openRouterCostUsdFromProviderMetadata(generation.providerMetadata),
      });
      if (!parsed.success) {
        throw new Error(`AnalystOutput validation failed: ${JSON.stringify(parsed.error.issues)}`);
      }
      return parsed.data;
    },
  };
}

export function createOpenRouterAnalystGenerator(
  apiKey = Bun.env.OPENROUTER_API_KEY,
): AnalystGenerator {
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required for v_ankit_classic analyst generation');
  }

  const provider = createOpenRouter({
    apiKey,
    appName: 'ankit-prop-trader',
    appUrl: 'https://github.com/ewildee/ankit-prop-trading-agent',
    compatibility: 'strict',
  });

  return async (request) => {
    const result = await generateObject({
      model: provider(request.model, {
        plugins: [{ id: 'response-healing' }],
        usage: { include: true },
      }),
      schema: AnalystGenerationOutput,
      schemaName: 'AnalystGenerationOutput',
      schemaDescription:
        'Validated model-generated Analyst fields for v_ankit_classic; runtime fills deterministic telemetry fields.',
      system: request.system,
      prompt: request.prompt,
      maxOutputTokens: request.maxOutputTokens,
      providerOptions: buildOpenRouterAnalystProviderOptions(request),
    });
    return {
      object: result.object,
      usage: result.usage,
      ...(result.providerMetadata ? { providerMetadata: result.providerMetadata } : {}),
    };
  };
}

export function buildOpenRouterAnalystProviderOptions(request: AnalystGenerationRequest) {
  return {
    openrouter: {
      usage: { include: true },
      ...(request.reasoningMaxTokens
        ? {
            reasoning: {
              max_tokens: request.reasoningMaxTokens,
              exclude: true,
            },
          }
        : {}),
    },
  };
}

function buildAnalystPrompt({
  input,
  recentBars,
  regimeLabel,
  confluence,
  calendarLookahead,
}: {
  readonly input: AnalystStageInput;
  readonly recentBars: ReadonlyArray<Bar>;
  readonly regimeLabel: string;
  readonly confluence: ReturnType<typeof scoreConfluence>;
  readonly calendarLookahead: ReadonlyArray<unknown>;
}): string {
  return JSON.stringify({
    personaId: input.persona.personaId,
    instrument: input.persona.instrument,
    timeframe: input.persona.timeframe,
    decidedAt: input.context.decidedAt,
    paramsHash: input.context.paramsHash,
    regimeLabel,
    confluence,
    bars: recentBars,
    calendarLookahead,
    instruction:
      'Return only the model-generated Analyst fields. Do not include regimeLabel, confidence, confluenceScore, regimeNote, or cacheStats; runtime computes and injects those deterministic fields.',
  });
}

function cacheStatsFromUsage(usage: LanguageModelUsage): CacheLayerStats {
  const inputCachedTokens =
    usage.inputTokenDetails?.cacheReadTokens ?? usage.cachedInputTokens ?? ZERO;
  const inputCacheWriteTokens = usage.inputTokenDetails?.cacheWriteTokens ?? ZERO;
  const inputFreshTokens =
    usage.inputTokenDetails?.noCacheTokens ??
    Math.max((usage.inputTokens ?? ZERO) - inputCachedTokens - inputCacheWriteTokens, ZERO);
  return {
    inputCachedTokens,
    inputFreshTokens,
    inputCacheWriteTokens,
    outputTokens: usage.outputTokens ?? ZERO,
    thinkingTokens: usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens ?? ZERO,
  };
}

export function openRouterCostUsdFromProviderMetadata(
  providerMetadata: ProviderMetadata | undefined,
): number | undefined {
  const openrouter = providerMetadata?.openrouter;
  if (!isRecord(openrouter)) return undefined;
  const usage = openrouter.usage;
  if (!isRecord(usage)) return undefined;
  const cost = usage.cost;
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= ZERO ? cost : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
