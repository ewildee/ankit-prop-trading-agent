import type { TraderOutput } from '@ankit-prop/contracts';
import { EPSILON, HUNDRED, ZERO } from '../analyst/constants.ts';
import type { TraderStage, TraderStageInput } from '../pipeline/stages.ts';

const ZERO_CACHE_STATS = {
  inputCachedTokens: ZERO,
  inputFreshTokens: ZERO,
  inputCacheWriteTokens: ZERO,
  outputTokens: ZERO,
  thinkingTokens: ZERO,
} as const;

export type OpenPositionSnapshot = {
  readonly id: string;
  readonly side: 'BUY' | 'SELL';
};

export type CreateVAnkitClassicTraderOptions = {
  readonly openPosition?: (input: TraderStageInput) => OpenPositionSnapshot | null;
  readonly currentEquity?: (input: TraderStageInput) => number;
  readonly recentAtrPips?: (input: TraderStageInput) => number;
};

export function createVAnkitClassicTrader(
  options: CreateVAnkitClassicTraderOptions = {},
): TraderStage {
  return {
    decide(input): TraderOutput {
      if (input.persona.personaId !== 'v_ankit_classic') {
        throw new Error(`unsupported trader persona: ${input.persona.personaId}`);
      }
      const output = decideVAnkitClassic(input, options);
      if (
        output.action === 'AMEND' ||
        !input.persona.v0RuntimeActionAllowList.includes(output.action)
      ) {
        throw new Error(`trader action outside v0 allow-list: ${output.action}`);
      }
      return output;
    },
  };
}

function decideVAnkitClassic(
  input: TraderStageInput,
  options: CreateVAnkitClassicTraderOptions,
): TraderOutput {
  const confidenceThreshold = input.persona.scoring.threshold / HUNDRED;
  if (input.analystOutput.bias === 'neutral') {
    return hold('neutral_bias');
  }
  if (input.analystOutput.confidence < confidenceThreshold) {
    return hold('confidence_below_threshold');
  }

  const side = input.analystOutput.bias === 'long' ? 'BUY' : 'SELL';
  const openPosition = options.openPosition?.(input) ?? null;
  if (openPosition !== null) {
    if (isOpposite(side, openPosition.side)) {
      return {
        action: 'CLOSE',
        idempotencyKey: `${input.context.runId}:${input.bar.tsEnd}:close:${openPosition.id}`,
        positionId: openPosition.id,
        rationale: 'Analyst bias is opposite the open position, so v0 closes risk.',
        cacheStats: ZERO_CACHE_STATS,
      };
    }
    return hold('existing_position_aligned');
  }

  const stopLossPips =
    Math.max(options.recentAtrPips?.(input) ?? Math.abs(input.bar.high - input.bar.low), EPSILON) *
    input.persona.filters.minStopAtrMultiple;
  const equity = Math.max(options.currentEquity?.(input) ?? input.bar.close, EPSILON);
  const riskCash = equity * (input.persona.risk.maxPerTradePct / HUNDRED);

  return {
    action: 'OPEN',
    idempotencyKey: `${input.context.runId}:${input.bar.tsEnd}:open:${side}`,
    side,
    size: {
      lots: Math.max(riskCash / stopLossPips, EPSILON),
      pctEquity: input.persona.risk.maxPerTradePct,
    },
    entry: { type: 'market' },
    stopLossPips,
    takeProfitPips: stopLossPips * input.persona.risk.minRR,
    rationale: 'Analyst bias and confidence passed v0 thresholds with no open position.',
    expectedRR: input.persona.risk.minRR,
    cacheStats: ZERO_CACHE_STATS,
  };
}

function hold(reason: string): TraderOutput {
  return {
    action: 'HOLD',
    rationale: reason,
    reason,
    cacheStats: ZERO_CACHE_STATS,
  };
}

function isOpposite(nextSide: 'BUY' | 'SELL', openSide: 'BUY' | 'SELL'): boolean {
  return nextSide !== openSide;
}
