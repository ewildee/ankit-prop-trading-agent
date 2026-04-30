import { z } from 'zod';
import { RailVerdict } from './hard-rails.ts';
import { CalendarItem } from './news.ts';

export const PersonaId = z.string().regex(/^v_[a-z0-9_]+$/);
export type PersonaId = z.infer<typeof PersonaId>;

export const RegimeLabel = z.enum([
  'A_session_break',
  'B_trend_retrace',
  'B_consolidation_break',
  'B_reversal',
  'C_macro_filter',
  'outside_active_window',
  'unknown',
]);
export type RegimeLabel = z.infer<typeof RegimeLabel>;

export const CacheLayerStats = z.strictObject({
  inputCachedTokens: z.number().int().nonnegative(),
  inputFreshTokens: z.number().int().nonnegative(),
  inputCacheWriteTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  thinkingTokens: z.number().int().nonnegative(),
});
export type CacheLayerStats = z.infer<typeof CacheLayerStats>;

// OpenRouter reports this as credits-USD after account discounts, not upstream
// inference USD. Reflector cost gates intentionally consume this billed number.
const StageCostUsd = z.number().nonnegative().optional();
const AnalystReasoningSummaryMaxChars = 500;

export const RiskBudgetRemaining = z.strictObject({
  dailyPct: z.number().nonnegative(),
  overallPct: z.number().nonnegative(),
});
export type RiskBudgetRemaining = z.infer<typeof RiskBudgetRemaining>;

export const KeyLevel = z.strictObject({
  name: z.string().min(1),
  price: z.number().positive(),
  timeframe: z.string().min(1).optional(),
});
export type KeyLevel = z.infer<typeof KeyLevel>;

export const AnalystOutput = z.strictObject({
  thesis: z.string().min(20).max(800),
  bias: z.enum(['long', 'short', 'neutral']),
  confidence: z.number().min(0).max(1),
  confluenceScore: z.number().min(0).max(100),
  keyLevels: z.array(KeyLevel),
  regimeLabel: RegimeLabel,
  regimeNote: z.string().max(80),
  reasoningSummary: z.string().max(AnalystReasoningSummaryMaxChars).optional(),
  supportingEvidence: z.string().max(1200).optional(),
  withholdMinutes: z.number().int().min(0).max(60).optional(),
  freshnessLag: z.number().int().nonnegative().optional(),
  fallbackReason: z.enum(['no_object_generated_length', 'request_timeout']).optional(),
  cacheStats: CacheLayerStats,
  costUsd: StageCostUsd,
});
export type AnalystOutput = z.infer<typeof AnalystOutput>;

export const AnalystRuntimeConfig = z.strictObject({
  model: z.string().min(1),
  maxOutputTokens: z.number().int().positive(),
  reasoningMaxTokens: z.number().int().positive().optional(),
  requestTimeoutMs: z.number().int().positive().optional(),
  barLookback: z.number().int().positive(),
  calendarLookaheadLimit: z.number().int().nonnegative(),
  regime: z.strictObject({
    minSeriesBars: z.number().int().positive(),
    breakoutClosePosition: z.number().min(0).max(1),
    trendMoveAtrMultiple: z.number().positive(),
    retraceBodyAtrMaximum: z.number().positive(),
    consolidationRangeAtrMaximum: z.number().positive(),
    reversalWickBodyMultiple: z.number().positive(),
    macroEventLookaheadMinutes: z.number().int().nonnegative(),
  }),
});
export type AnalystRuntimeConfig = z.infer<typeof AnalystRuntimeConfig>;

export const TRADER_ACTIONS = ['HOLD', 'OPEN', 'CLOSE', 'AMEND'] as const;
export type TraderAction = (typeof TRADER_ACTIONS)[number];

// Canonical contract is wider than the first v0 runtime slice. AMEND stays in
// the shared type per BLUEPRINT decision E, but early trader emitters may gate
// themselves to this allow-list until amend routing is implemented.
export const V0_TRADER_RUNTIME_ACTIONS = ['HOLD', 'OPEN', 'CLOSE'] as const;
export type V0TraderRuntimeAction = (typeof V0_TRADER_RUNTIME_ACTIONS)[number];

const TraderBaseOutput = z.strictObject({
  rationale: z.string().max(200),
  expectedRR: z.number().positive().optional(),
  cacheStats: CacheLayerStats,
  costUsd: StageCostUsd,
});

export const TraderHoldOutput = TraderBaseOutput.extend({
  action: z.literal('HOLD'),
  reason: z.string().min(1).max(200).optional(),
});
export type TraderHoldOutput = z.infer<typeof TraderHoldOutput>;

export const TraderOpenOutput = TraderBaseOutput.extend({
  action: z.literal('OPEN'),
  idempotencyKey: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  size: z.strictObject({
    lots: z.number().positive(),
    pctEquity: z.number().positive(),
  }),
  entry: z.strictObject({
    type: z.enum(['market', 'limit']),
    price: z.number().positive().optional(),
    expiresInBars: z.number().int().positive().optional(),
  }),
  stopLossPips: z.number().positive(),
  takeProfitPips: z.number().positive().optional(),
  trailingStop: z
    .strictObject({
      activateAtR: z.number().positive(),
      distanceDollars: z.number().positive(),
    })
    .optional(),
});
export type TraderOpenOutput = z.infer<typeof TraderOpenOutput>;

export const TraderCloseOutput = TraderBaseOutput.extend({
  action: z.literal('CLOSE'),
  idempotencyKey: z.string().min(1),
  positionId: z.string().min(1),
});
export type TraderCloseOutput = z.infer<typeof TraderCloseOutput>;

export const TraderAmendOutput = TraderBaseOutput.extend({
  action: z.literal('AMEND'),
  idempotencyKey: z.string().min(1),
  positionId: z.string().min(1),
  amend: z.strictObject({
    amendType: z.enum(['sl', 'tp', 'trailing_distance']),
    newValue: z.number().positive(),
  }),
});
export type TraderAmendOutput = z.infer<typeof TraderAmendOutput>;

export const TraderOutput = z.discriminatedUnion('action', [
  TraderHoldOutput,
  TraderOpenOutput,
  TraderCloseOutput,
  TraderAmendOutput,
]);
export type TraderOutput = z.infer<typeof TraderOutput>;

export const RecentDecisionSummary = z.strictObject({
  decisionId: z.string().min(1),
  decidedAt: z.string().min(1),
  traderAction: z.enum(TRADER_ACTIONS),
  judgeVerdict: z.enum(['APPROVE', 'REJECT']).nullable(),
  outcome: z.enum(['pending', 'win', 'loss', 'scratch', 'no_trade']).optional(),
});
export type RecentDecisionSummary = z.infer<typeof RecentDecisionSummary>;

export const JudgeInput = z.strictObject({
  traderOutput: TraderOutput,
  analystOutput: AnalystOutput,
  riskBudgetRemaining: RiskBudgetRemaining,
  openExposure: z.strictObject({
    totalPct: z.number().nonnegative(),
    sameDirectionPct: z.number().nonnegative(),
  }),
  recentDecisions: z.array(RecentDecisionSummary).max(10),
  calendarLookahead: z.array(CalendarItem),
  spreadStats: z.strictObject({
    current: z.number().nonnegative(),
    typical: z.number().positive(),
  }),
  strategyParams: z.record(z.string(), z.unknown()),
});
export type JudgeInput = z.infer<typeof JudgeInput>;

export const RejectionRule = z.enum([
  'rr_below_floor',
  'size_above_soft_rail',
  'daily_budget_insufficient',
  'calendar_event_proximity',
  'spread_above_threshold',
  'open_exposure_at_cap',
  'recent_whipsaw',
  'thesis_self_contradiction',
  'stale_thesis',
  'macro_bias_violation',
  'confluence_too_weak',
  'anticipation_breakout',
  'stop_inside_noise',
  'pattern_regime_mismatch',
  'outside_active_window',
]);
export type RejectionRule = z.infer<typeof RejectionRule>;

export const JudgeOutput = z.strictObject({
  verdict: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().max(200),
  rejectedRules: z.array(RejectionRule).optional(),
  cacheStats: CacheLayerStats,
  costUsd: StageCostUsd,
});
export type JudgeOutput = z.infer<typeof JudgeOutput>;

export const PersonaConfig = z.strictObject({
  schemaVersion: z.literal(1),
  personaId: PersonaId,
  instrument: z.string().min(1),
  timeframe: z.string().min(1),
  decisionCadence: z.string().min(1),
  actionCadence: z.enum(['bar_close']),
  v0RuntimeActionAllowList: z.array(z.enum(V0_TRADER_RUNTIME_ACTIONS)).nonempty(),
  analyst: AnalystRuntimeConfig,
  windowPrague: z.strictObject({
    macroSynthesis: z.string().min(1),
    preSessionStart: z.string().min(1),
    preSessionEnd: z.string().min(1),
    activeStart: z.string().min(1),
    activeEnd: z.string().min(1),
  }),
  families: z.strictObject({
    sessionBreakout: z.strictObject({
      enabled: z.boolean(),
      start: z.string().min(1),
      end: z.string().min(1),
      targetMinR: z.number().positive(),
      stopAtPreSessionMidpoint: z.boolean(),
    }),
    multiTimeframeConfluence: z.strictObject({
      enabled: z.boolean(),
      start: z.string().min(1),
      end: z.string().min(1),
    }),
    macroFilter: z.strictObject({
      enabled: z.boolean(),
    }),
  }),
  macro: z.strictObject({
    minConfidence: z.number().min(0).max(1),
    cooldownHoursAfterFlip: z.number().positive(),
  }),
  risk: z.strictObject({
    maxPerTradePct: z.number().positive(),
    minRR: z.number().positive(),
  }),
  filters: z.strictObject({
    maxSpreadMultiplier: z.number().positive(),
    minStopAtrMultiple: z.number().positive(),
  }),
  judge: z.strictObject({
    threshold: z.number().min(0).max(100),
    personaRejectionRules: z.array(RejectionRule),
  }),
  indicators: z.strictObject({
    timeframes: z.array(z.string().min(1)).nonempty(),
    enabled: z.array(
      z.strictObject({
        name: z.string().min(1),
        params: z.record(z.string(), z.unknown()),
      }),
    ),
  }),
  scoring: z.strictObject({
    scheme: z.enum(['v1_continuous_confluence', 'v2_discrete_buckets']),
    threshold: z.number().min(0).max(100),
    weights: z.strictObject({
      timeframeAgreement: z.number().min(0).max(1),
      indicatorAlignment: z.number().min(0).max(1),
    }),
    timeframeWeights: z.record(z.string(), z.number().positive()),
  }),
  trail: z.strictObject({
    enabled: z.boolean(),
    activateAtR: z.number().positive(),
    distanceDollars: z.number().positive(),
  }),
  escalation: z.strictObject({
    nearBarCloseSeconds: z.number().int().positive(),
    disagreementLookback: z.number().int().positive(),
    dailyRiskBudgetConsumedPct: z.number().positive(),
  }),
});
export type PersonaConfig = z.infer<typeof PersonaConfig>;

export const GatewayDecision = z.discriminatedUnion('status', [
  // Trader produced HOLD or judge rejected; the gateway was never reached.
  z.strictObject({
    status: z.literal('not_submitted'),
    reason: z.enum(['hold', 'judge_reject']),
    traderOutput: z.union([
      TraderHoldOutput,
      TraderOpenOutput,
      TraderCloseOutput,
      TraderAmendOutput,
    ]),
    railVerdict: z.null(),
  }),
  // Pre-submit hard rails blocked transmission. The action reached the gateway,
  // but rails refused to forward it to the broker.
  z.strictObject({
    status: z.literal('rejected_by_rails'),
    traderOutput: z.union([TraderOpenOutput, TraderCloseOutput, TraderAmendOutput]),
    railVerdict: RailVerdict.refine((verdict) => verdict.outcome === 'reject', {
      message: "rejected_by_rails requires railVerdict.outcome === 'reject'",
    }),
  }),
  // Order made it to the broker. Rails either passed it through unchanged or
  // tightened it on the way; a reject verdict here is a contract violation.
  z.strictObject({
    status: z.literal('submitted'),
    traderOutput: z.union([TraderOpenOutput, TraderCloseOutput, TraderAmendOutput]),
    railVerdict: RailVerdict.refine(
      (verdict) => verdict.outcome === 'allow' || verdict.outcome === 'tighten',
      {
        message: "submitted requires railVerdict.outcome 'allow' or 'tighten'",
      },
    ),
    submittedAt: z.string().min(1),
  }),
]);
export type GatewayDecision = z.infer<typeof GatewayDecision>;

export const DecisionRecord = z.strictObject({
  decisionId: z.string().min(1),
  runId: z.string().min(1),
  personaId: PersonaId,
  instrument: z.string().min(1),
  timeframe: z.string().min(1),
  barClosedAt: z.string().min(1),
  paramsHash: z.string().min(1),
  analystOutput: AnalystOutput,
  traderOutput: TraderOutput,
  judgeOutput: JudgeOutput.nullable(),
  gatewayDecision: GatewayDecision.nullable(),
  decidedAt: z.string().min(1),
});
export type DecisionRecord = z.infer<typeof DecisionRecord>;

export const RunLlmCostUsd = z.strictObject({
  inputCachedUsd: z.number().nonnegative(),
  inputFreshUsd: z.number().nonnegative(),
  inputCacheWriteUsd: z.number().nonnegative(),
  outputUsd: z.number().nonnegative(),
  thinkingUsd: z.number().nonnegative(),
  totalUsd: z.number().nonnegative(),
});
export type RunLlmCostUsd = z.infer<typeof RunLlmCostUsd>;

export const RunAggregate = z.strictObject({
  runId: z.string().min(1),
  personaId: PersonaId,
  instrument: z.string().min(1),
  startedAt: z.string().min(1),
  endedAt: z.string().min(1).nullable(),
  decisionCount: z.number().int().nonnegative(),
  sortinoRolling60d: z.number(),
  llmCostUsd: RunLlmCostUsd,
  breachCount: z.number().int().nonnegative(),
  tradeCount: z.number().int().nonnegative(),
  analystFallbackCount: z.number().int().nonnegative(),
  realizedPnl: z.number(),
  traderActions: z.record(z.enum(TRADER_ACTIONS), z.number().int().nonnegative()),
  judgeVerdicts: z.record(z.enum(['APPROVE', 'REJECT']), z.number().int().nonnegative()),
  gatewayOutcomes: z.record(
    z.enum(['allow', 'tighten', 'reject', 'not_submitted']),
    z.number().int().nonnegative(),
  ),
});
export type RunAggregate = z.infer<typeof RunAggregate>;
