import type { JudgeOutput, RejectionRule } from '@ankit-prop/contracts';
import { ZERO } from '../analyst/constants.ts';
import type { JudgeStage, JudgeStageInput } from '../pipeline/stages.ts';

const ZERO_CACHE_STATS = {
  inputCachedTokens: ZERO,
  inputFreshTokens: ZERO,
  inputCacheWriteTokens: ZERO,
  outputTokens: ZERO,
  thinkingTokens: ZERO,
} as const;

export function createVAnkitClassicJudge(): JudgeStage {
  return {
    evaluate(input): JudgeOutput {
      if (input.persona.personaId !== 'v_ankit_classic') {
        throw new Error(`unsupported judge persona: ${input.persona.personaId}`);
      }
      return evaluateVAnkitClassic(input);
    },
  };
}

function evaluateVAnkitClassic(input: JudgeStageInput): JudgeOutput {
  const { judgeInput } = input;
  if (judgeInput.traderOutput.action === 'HOLD') {
    return reject('trader_hold', ['confluence_too_weak']);
  }
  if (judgeInput.traderOutput.action === 'CLOSE') {
    return {
      verdict: 'APPROVE',
      reason: 'close_risk_reducing',
      cacheStats: ZERO_CACHE_STATS,
    };
  }
  if (judgeInput.traderOutput.action === 'AMEND') {
    return reject('amend_not_in_v0_runtime', ['open_exposure_at_cap']);
  }

  const rejectedRules: RejectionRule[] = [];
  if (judgeInput.analystOutput.confluenceScore < input.persona.judge.threshold) {
    rejectedRules.push('confluence_too_weak');
  }
  if ((judgeInput.traderOutput.expectedRR ?? ZERO) < input.persona.risk.minRR) {
    rejectedRules.push('rr_below_floor');
  }
  if (judgeInput.traderOutput.size.pctEquity > input.persona.risk.maxPerTradePct) {
    rejectedRules.push('size_above_soft_rail');
  }
  if (judgeInput.riskBudgetRemaining.dailyPct < judgeInput.traderOutput.size.pctEquity) {
    rejectedRules.push('daily_budget_insufficient');
  }
  if (judgeInput.openExposure.totalPct > ZERO || judgeInput.openExposure.sameDirectionPct > ZERO) {
    rejectedRules.push('open_exposure_at_cap');
  }
  if (
    judgeInput.spreadStats.current >
    judgeInput.spreadStats.typical * input.persona.filters.maxSpreadMultiplier
  ) {
    rejectedRules.push('spread_above_threshold');
  }
  if (judgeInput.calendarLookahead.length > ZERO) {
    rejectedRules.push('calendar_event_proximity');
  }

  if (rejectedRules.length > ZERO) {
    return reject('v0_open_rejected', rejectedRules);
  }
  return {
    verdict: 'APPROVE',
    reason: 'v0_open_approved',
    cacheStats: ZERO_CACHE_STATS,
  };
}

function reject(reason: string, rejectedRules: RejectionRule[]): JudgeOutput {
  return {
    verdict: 'REJECT',
    reason,
    rejectedRules,
    cacheStats: ZERO_CACHE_STATS,
  };
}
