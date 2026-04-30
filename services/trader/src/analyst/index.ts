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
import { generateObject, type LanguageModelUsage } from 'ai';
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

export type AnalystGenerationRequest = {
  readonly model: string;
  readonly maxOutputTokens: number;
  readonly system: string;
  readonly prompt: string;
};

export type AnalystGenerationResult = {
  readonly object: unknown;
  readonly usage: LanguageModelUsage;
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
      });

      const parsed = AnalystOutput.safeParse({
        ...(generation.object as Record<string, unknown>),
        regimeLabel,
        confidence: confluence.confidence,
        confluenceScore: confluence.score,
        regimeNote: confluence.regimeNote,
        cacheStats: cacheStatsFromUsage(generation.usage),
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
      schema: AnalystOutput,
      schemaName: 'AnalystOutput',
      schemaDescription: 'Validated AnalystOutput for the v_ankit_classic trader persona.',
      system: request.system,
      prompt: request.prompt,
      maxOutputTokens: request.maxOutputTokens,
      providerOptions: {
        openrouter: {
          usage: { include: true },
        },
      },
    });
    return { object: result.object, usage: result.usage };
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
      'Return an AnalystOutput object. Keep regimeLabel, confidence, confluenceScore, regimeNote, and cacheStats present; runtime will verify and replace deterministic fields.',
  });
}

function cacheStatsFromUsage(usage: LanguageModelUsage): CacheLayerStats {
  const inputCachedTokens =
    usage.inputTokenDetails.cacheReadTokens ?? usage.cachedInputTokens ?? ZERO;
  const inputCacheWriteTokens = usage.inputTokenDetails.cacheWriteTokens ?? ZERO;
  const inputFreshTokens =
    usage.inputTokenDetails.noCacheTokens ??
    Math.max((usage.inputTokens ?? ZERO) - inputCachedTokens - inputCacheWriteTokens, ZERO);
  return {
    inputCachedTokens,
    inputFreshTokens,
    inputCacheWriteTokens,
    outputTokens: usage.outputTokens ?? ZERO,
    thinkingTokens: usage.outputTokenDetails.reasoningTokens ?? usage.reasoningTokens ?? ZERO,
  };
}
