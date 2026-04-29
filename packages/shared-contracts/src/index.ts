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
export {
  CalendarImpact,
  CalendarItem,
  CalendarResponse,
  NextRestrictedReply,
  RestrictedReason,
  RestrictedReply,
} from './news.ts';
export type { CreatePinoLoggerOptions, PinoLogger } from './obs/pino-logger.ts';
export { createPinoLogger, DEFAULT_REDACT_PATHS } from './obs/pino-logger.ts';
export type { PragueParts } from './time.ts';
export { pragueDayBucket, pragueParts } from './time.ts';
export type {
  ServiceKey,
  ServiceRegistry,
  ServiceRegistryEntry,
  TreatyClient,
  TreatyExportSource,
} from './treaty-client/index.ts';
export {
  assertExportsTreaty,
  createTreatyClient,
  SERVICE_KEYS,
  SERVICES,
} from './treaty-client/index.ts';
