import { z } from 'zod';

export const STAGE_NAMES = ['analyst', 'trader', 'judge', 'reflector'] as const;
export type StageName = (typeof STAGE_NAMES)[number];
export const StageName = z.enum(STAGE_NAMES);

export const FTMO_BREACH_KINDS = [
  'daily_loss',
  'overall_loss',
  'min_hold',
  'news_blackout_hold',
  'news_blackout_open',
  'news_blackout_close',
  'news_sl_tp_in_window',
  'weekend_hold',
  'hft_classification',
  'ea_throttle_exceeded',
  'consistency_violation',
] as const;
export type FtmoBreachKind = (typeof FTMO_BREACH_KINDS)[number];

export const FTMO_BREACH_SCOPES = ['ftmo', 'internal'] as const;
export type FtmoBreachScope = (typeof FTMO_BREACH_SCOPES)[number];

export const FtmoBreach = z.strictObject({
  kind: z.enum(FTMO_BREACH_KINDS),
  scope: z.enum(FTMO_BREACH_SCOPES),
  accountId: z.string(),
  envelopeId: z.string().nullable(),
  occurredAt: z.string(),
  message: z.string(),
  detail: z.record(z.string(), z.unknown()),
});
export type FtmoBreach = z.infer<typeof FtmoBreach>;

export const EvalMetrics = z.strictObject({
  sortinoRolling60d: z.number(),
  maxDrawdownPct: z.number(),
  profitFactor: z.number(),
  tradeCount: z.number().int(),
  winRate: z.number(),
  averageRR: z.number(),
});
export type EvalMetrics = z.infer<typeof EvalMetrics>;

export const StageCost = z.strictObject({
  input: z.number(),
  output: z.number(),
  cached: z.number(),
});
export type StageCost = z.infer<typeof StageCost>;

export const CostBreakdown = z.strictObject({
  perStage: z.record(StageName, StageCost),
  totalUsd: z.number(),
});
export type CostBreakdown = z.infer<typeof CostBreakdown>;

export const WalkForwardFold = z.strictObject({
  index: z.number().int().min(0),
  trainStart: z.string(),
  trainEnd: z.string(),
  scoreStart: z.string(),
  scoreEnd: z.string(),
});
export type WalkForwardFold = z.infer<typeof WalkForwardFold>;

export const FoldResult = z.strictObject({
  fold: WalkForwardFold,
  metrics: EvalMetrics,
  ftmoBreaches: z.array(FtmoBreach),
  passed: z.boolean(),
  reason: z.string().nullable(),
});
export type FoldResult = z.infer<typeof FoldResult>;

export const WalkForwardSummary = z.object({
  folds: z.array(FoldResult).length(12),
  passingFolds: z.number().int(),
});
export type WalkForwardSummary = z.infer<typeof WalkForwardSummary>;

export const EvalResult = z.strictObject({
  metrics: EvalMetrics,
  ftmoBreaches: z.array(FtmoBreach),
  costBreakdown: CostBreakdown,
  diagnostics: z.record(z.string(), z.unknown()),
  walkForward: WalkForwardSummary.optional(),
});
export type EvalResult = z.infer<typeof EvalResult>;
