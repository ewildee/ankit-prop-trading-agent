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
import { generateText, type LanguageModelUsage, Output, type ProviderMetadata } from 'ai';
import type { AnalystStage, AnalystStageInput } from '../pipeline/stages.ts';
import { scoreConfluence } from './confluence-score.ts';
import { ZERO } from './constants.ts';
import { classifyRegime } from './regime-classifier.ts';

const ANALYST_GENERATION_MAX_ATTEMPTS = 3;
const ANALYST_GENERATION_RETRY_MAX_OUTPUT_TOKENS = 4096;
export const DEFAULT_ANALYST_REQUEST_TIMEOUT_MS = 90_000;
const ANALYST_SAFE_FALLBACK_THESIS =
  'ANALYST_SAFE_FALLBACK: structured generation failed after retry escalation; neutral HOLD emitted.';
const OUTSIDE_ACTIVE_WINDOW_THESIS =
  'outside-active-window: deterministic skip; analyst LLM not invoked.';

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
  fallbackReason: true,
  cacheStats: true,
  costUsd: true,
});

export type AnalystGenerationRequest = {
  readonly model: string;
  readonly maxOutputTokens: number;
  readonly reasoningMaxTokens?: number;
  readonly reasoningStrategy?: 'max_tokens' | 'effort_low' | 'none';
  readonly requestTimeoutMs: number;
  readonly abortSignal?: AbortSignal;
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

export class RequestTimeoutError extends Error {
  readonly requestTimeoutMs: number;

  constructor(requestTimeoutMs: number) {
    super(`Analyst generateObject timed out after ${requestTimeoutMs}ms`);
    this.name = 'RequestTimeoutError';
    this.requestTimeoutMs = requestTimeoutMs;
  }
}

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
      if (regimeLabel === 'outside_active_window') {
        return outsideActiveWindowAnalystOutput(confluence.regimeNote);
      }
      const staticPrompt = await readFile(promptPath, 'utf8');
      const baseGenerationRequest = {
        model: input.persona.analyst.model,
        maxOutputTokens: input.persona.analyst.maxOutputTokens,
        requestTimeoutMs:
          input.persona.analyst.requestTimeoutMs ?? DEFAULT_ANALYST_REQUEST_TIMEOUT_MS,
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
      } satisfies AnalystGenerationRequest;
      const generation = await generateWithRetry(generator, baseGenerationRequest);

      if (!generation.success) {
        return fallbackAnalystOutput({
          regimeLabel,
          fallbackReason: generation.failure.fallbackReason,
          telemetry: generation.telemetry,
        });
      }

      const parsedGeneration = AnalystGenerationOutput.safeParse(generation.result.object);
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
        cacheStats: generation.telemetry.cacheStats,
        costUsd: generation.telemetry.costUsd,
      });
      if (!parsed.success) {
        throw new Error(`AnalystOutput validation failed: ${JSON.stringify(parsed.error.issues)}`);
      }
      return parsed.data;
    },
  };
}

function outsideActiveWindowAnalystOutput(regimeNote: string): AnalystOutputType {
  return AnalystOutput.parse({
    thesis: OUTSIDE_ACTIVE_WINDOW_THESIS,
    bias: 'neutral',
    confidence: ZERO,
    confluenceScore: ZERO,
    keyLevels: [],
    regimeLabel: 'outside_active_window',
    regimeNote,
    cacheStats: zeroCacheStats(),
    costUsd: ZERO,
  });
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
    const result = await generateText({
      model: provider(request.model, {
        plugins: [{ id: 'response-healing' }],
        usage: { include: true },
      }),
      output: buildOpenRouterAnalystGenerationOutputMode(),
      system: request.system,
      prompt: request.prompt,
      maxOutputTokens: request.maxOutputTokens,
      ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
      providerOptions: buildOpenRouterAnalystProviderOptions(request),
    });
    return {
      object: result.output,
      usage: result.usage,
      ...(result.providerMetadata ? { providerMetadata: result.providerMetadata } : {}),
    };
  };
}

export function buildOpenRouterAnalystGenerationOutputMode() {
  // ai@6.0.168 exposes schema-free JSON mode through generateText output.json.
  return Output.json({
    name: 'AnalystGenerationOutput',
    description:
      'Validated model-generated Analyst fields for v_ankit_classic; runtime fills deterministic telemetry fields.',
  });
}

export function buildOpenRouterAnalystProviderOptions(
  request: Pick<AnalystGenerationRequest, 'reasoningMaxTokens' | 'reasoningStrategy'>,
) {
  const openrouter: {
    usage: { include: boolean };
    reasoning?: {
      max_tokens?: number;
      effort?: 'low';
      exclude: boolean;
    };
  } = {
    usage: { include: true },
  };
  if (request.reasoningStrategy === 'effort_low') {
    openrouter.reasoning = {
      effort: 'low',
      exclude: true,
    };
  } else if (request.reasoningStrategy !== 'none' && request.reasoningMaxTokens) {
    openrouter.reasoning = {
      max_tokens: request.reasoningMaxTokens,
      exclude: true,
    };
  }

  return {
    openrouter,
  };
}

type AnalystGenerationSuccess = {
  readonly success: true;
  readonly result: AnalystGenerationResult;
  readonly telemetry: AnalystGenerationTelemetry;
};

type AnalystGenerationFailure = {
  readonly success: false;
  readonly failure: RetryableAnalystGenerationFailure;
  readonly telemetry: AnalystGenerationTelemetry;
};

type RetryableAnalystGenerationFailure = {
  readonly fallbackReason: NonNullable<AnalystOutputType['fallbackReason']>;
  readonly usage?: LanguageModelUsage;
  readonly providerMetadata?: ProviderMetadata;
};

type AnalystGenerationTelemetry = {
  readonly cacheStats: CacheLayerStats;
  readonly costUsd?: number;
};

async function generateWithRetry(
  generator: AnalystGenerator,
  baseRequest: AnalystGenerationRequest,
): Promise<AnalystGenerationSuccess | AnalystGenerationFailure> {
  let lastRetryableFailure: RetryableAnalystGenerationFailure | null = null;
  let telemetry = zeroGenerationTelemetry();

  for (const request of analystGenerationAttempts(baseRequest)) {
    try {
      const result = await generateAnalystObjectWithTimeout(generator, request);
      telemetry = addGenerationTelemetry(telemetry, telemetryFromGenerationResult(result));
      return { success: true, result, telemetry };
    } catch (error) {
      if (!isRetryableAnalystGenerationFailure(error)) throw error;
      lastRetryableFailure = retryableAnalystGenerationFailureFromError(error);
      telemetry = addGenerationTelemetry(
        telemetry,
        telemetryFromRetryableFailure(lastRetryableFailure),
      );
    }
  }

  return {
    success: false,
    failure: lastRetryableFailure ?? { fallbackReason: 'request_timeout' },
    telemetry,
  };
}

export async function generateAnalystObjectWithTimeout(
  generator: AnalystGenerator,
  request: AnalystGenerationRequest,
): Promise<AnalystGenerationResult> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new RequestTimeoutError(request.requestTimeoutMs);
      reject(error);
      controller.abort(error);
    }, request.requestTimeoutMs);
  });

  try {
    return await Promise.race([
      generator({ ...request, abortSignal: controller.signal }),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function analystGenerationAttempts(
  baseRequest: AnalystGenerationRequest,
): ReadonlyArray<AnalystGenerationRequest> {
  const doubledOutputTokens = Math.min(
    baseRequest.maxOutputTokens * 2,
    ANALYST_GENERATION_RETRY_MAX_OUTPUT_TOKENS,
  );
  const attempts: AnalystGenerationRequest[] = [
    { ...baseRequest, reasoningStrategy: 'max_tokens' },
    {
      ...baseRequest,
      reasoningStrategy: 'effort_low',
      maxOutputTokens: doubledOutputTokens,
    },
    {
      ...baseRequest,
      reasoningStrategy: 'none',
      maxOutputTokens: ANALYST_GENERATION_RETRY_MAX_OUTPUT_TOKENS,
    },
  ];
  return attempts.slice(0, ANALYST_GENERATION_MAX_ATTEMPTS);
}

function fallbackAnalystOutput({
  regimeLabel,
  fallbackReason,
  telemetry,
}: {
  readonly regimeLabel: AnalystOutputType['regimeLabel'];
  readonly fallbackReason: NonNullable<AnalystOutputType['fallbackReason']>;
  readonly telemetry: AnalystGenerationTelemetry;
}): AnalystOutputType {
  const parsed = AnalystOutput.parse({
    thesis: ANALYST_SAFE_FALLBACK_THESIS,
    bias: 'neutral',
    confidence: ZERO,
    confluenceScore: ZERO,
    keyLevels: [],
    regimeLabel,
    regimeNote: 'analyst safe fallback',
    fallbackReason,
    cacheStats: telemetry.cacheStats,
    costUsd: telemetry.costUsd ?? ZERO,
  });
  return parsed;
}

function isRetryableAnalystGenerationFailure(error: unknown): boolean {
  return error instanceof RequestTimeoutError || isRetryableNoObjectLengthFailure(error);
}

function isRetryableNoObjectLengthFailure(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return (
    (error.name === 'AI_NoObjectGeneratedError' || error.name === 'NoObjectGeneratedError') &&
    error.finishReason === 'length'
  );
}

function retryableAnalystGenerationFailureFromError(
  error: unknown,
): RetryableAnalystGenerationFailure {
  if (error instanceof RequestTimeoutError) {
    return { fallbackReason: 'request_timeout' };
  }
  if (!isRecord(error)) return { fallbackReason: 'no_object_generated_length' };
  return {
    fallbackReason: 'no_object_generated_length',
    ...(isLanguageModelUsage(error.usage) ? { usage: error.usage } : {}),
    ...(isProviderMetadata(error.providerMetadata)
      ? { providerMetadata: error.providerMetadata }
      : {}),
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

function zeroCacheStats(): CacheLayerStats {
  return {
    inputCachedTokens: ZERO,
    inputFreshTokens: ZERO,
    inputCacheWriteTokens: ZERO,
    outputTokens: ZERO,
    thinkingTokens: ZERO,
  };
}

function zeroGenerationTelemetry(): AnalystGenerationTelemetry {
  return {
    cacheStats: zeroCacheStats(),
  };
}

function telemetryFromGenerationResult(
  result: AnalystGenerationResult,
): AnalystGenerationTelemetry {
  const costUsd = openRouterCostUsdFromProviderMetadata(result.providerMetadata);
  return {
    cacheStats: cacheStatsFromUsage(result.usage),
    ...(costUsd === undefined ? {} : { costUsd }),
  };
}

function telemetryFromRetryableFailure(
  failure: RetryableAnalystGenerationFailure,
): AnalystGenerationTelemetry {
  const costUsd = openRouterCostUsdFromProviderMetadata(failure.providerMetadata);
  return {
    cacheStats: failure.usage ? cacheStatsFromUsage(failure.usage) : zeroCacheStats(),
    ...(costUsd === undefined ? {} : { costUsd }),
  };
}

function addGenerationTelemetry(
  left: AnalystGenerationTelemetry,
  right: AnalystGenerationTelemetry,
): AnalystGenerationTelemetry {
  const costUsd =
    left.costUsd === undefined && right.costUsd === undefined
      ? undefined
      : (left.costUsd ?? ZERO) + (right.costUsd ?? ZERO);
  return {
    cacheStats: addCacheStats(left.cacheStats, right.cacheStats),
    ...(costUsd === undefined ? {} : { costUsd }),
  };
}

function addCacheStats(left: CacheLayerStats, right: CacheLayerStats): CacheLayerStats {
  return {
    inputCachedTokens: left.inputCachedTokens + right.inputCachedTokens,
    inputFreshTokens: left.inputFreshTokens + right.inputFreshTokens,
    inputCacheWriteTokens: left.inputCacheWriteTokens + right.inputCacheWriteTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    thinkingTokens: left.thinkingTokens + right.thinkingTokens,
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

function isLanguageModelUsage(value: unknown): value is LanguageModelUsage {
  return isRecord(value);
}

function isProviderMetadata(value: unknown): value is ProviderMetadata {
  return isRecord(value);
}
