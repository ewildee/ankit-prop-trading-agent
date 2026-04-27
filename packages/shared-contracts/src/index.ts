export const PHASE_0_SENTINEL = 'phase-0-scaffold' as const;
export type PhaseSentinel = typeof PHASE_0_SENTINEL;

export type { FtmoBreachKind, FtmoBreachScope } from './eval.ts';
export {
  CostBreakdown,
  EvalMetrics,
  EvalResult,
  FoldResult,
  FTMO_BREACH_KINDS,
  FTMO_BREACH_SCOPES,
  FtmoBreach,
  STAGE_NAMES,
  StageCost,
  StageName,
  WalkForwardFold,
  WalkForwardSummary,
} from './eval.ts';
export type { HardRailKey, RailOutcome } from './hard-rails.ts';
export {
  composeRailVerdict,
  EnvelopeFloors,
  HARD_RAIL_KEYS,
  HARD_RAIL_NUMBER,
  LossFraction,
  NO_RAILS_EVALUATED_REASON,
  RAIL_OUTCOMES,
  RailDecision,
  RailVerdict,
} from './hard-rails.ts';
export type { HealthStatus, SupervisorServiceState } from './health.ts';
export {
  AggregatedHealth,
  HEALTH_STATUS,
  HealthSnapshot,
  loadVersionFromPkgJson,
  ServiceStatus,
  SUPERVISOR_SERVICE_STATES,
} from './health.ts';
