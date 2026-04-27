export type { BacktestInput } from './backtest.ts';
export { backtest } from './backtest.ts';
export type { BarFetcher } from './bar-data-cache.ts';
export { BarDataCache, NoFetcher } from './bar-data-cache.ts';
export {
  AUTORESEARCH_PER_MUTATION_USD_CEILING,
  BACKTEST_DEFAULT_USD_CEILING,
  BACKTEST_PROD_USD_CEILING,
  CostBudgetExceeded,
  CostMeter,
  emptyCostBreakdown,
} from './cost.ts';
export type { GoldenFixture } from './fixtures/index.ts';
export {
  BAD_DAILY_LOSS_FIXTURE,
  BAD_MIN_HOLD_FIXTURE,
  BAD_NEWS_WINDOW_FIXTURE,
  BAD_WEEKEND_HOLD_FIXTURE,
  FLAT_FIXTURE,
  TRIVIAL_FIXTURE,
} from './fixtures/index.ts';
export type {
  FtmoLineMargins,
  FtmoSimulatorCfg,
  InternalMargins,
} from './ftmo-rules.ts';
export {
  buildBlackoutWindows,
  buildPreNewsWindows,
  FTMO_DEFAULT_LINE,
  FtmoSimulator,
  INTERNAL_DEFAULT_MARGINS,
} from './ftmo-rules.ts';
export type { LiveScoreInput } from './live-score.ts';
export { liveScore } from './live-score.ts';
export {
  averageRR,
  buildEquityCurve,
  computeMetrics,
  emptyMetrics,
  maxDrawdownPct,
  profitFactor,
  sortinoRolling,
  winRate,
} from './metrics.ts';
export type { PaperReplayInput, RecordedDecision } from './paper-replay.ts';
export { paperReplay } from './paper-replay.ts';
export type {
  PromotionDecision,
  PromotionFailure,
  PromotionGateInput,
} from './promotion-gate.ts';
export {
  evaluatePromotionGate,
  isFoldPassing,
  summarizeFoldMetrics,
} from './promotion-gate.ts';
export type { SimEngineCfg, SimEngineRun } from './sim-engine.ts';
export { pragueDayStartFromMs, runBarSimulation } from './sim-engine.ts';
export {
  applySlippage,
  atr14,
  effectiveSpreadPips,
  maxFillSlippage,
} from './slippage-model.ts';

export type {
  AccountConfig,
  AmendAction,
  Bar,
  BarStrategy,
  CalendarEvent,
  CloseAction,
  ClosedTrade,
  CostBreakdown,
  EvalMetrics,
  EvalResult,
  FoldResult,
  FtmoBreach,
  OpenAction,
  Side,
  SimContext,
  SimPosition,
  SlippageModelCfg,
  StageCost,
  StageName,
  StrategyAction,
  SymbolMeta,
  WalkForwardFold,
  WalkForwardSummary,
} from './types.ts';
export type { FoldRunner, WalkForwardCfg, WalkForwardRunCfg } from './walk-forward.ts';
export {
  buildFolds,
  runWalkForward,
  WALK_FORWARD_FOLD_COUNT,
} from './walk-forward.ts';
