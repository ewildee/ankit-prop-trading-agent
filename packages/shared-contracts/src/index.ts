export const PHASE_0_SENTINEL = 'phase-0-scaffold' as const;
export type PhaseSentinel = typeof PHASE_0_SENTINEL;

export type { HealthStatus, SupervisorServiceState } from './health.ts';
export {
  AggregatedHealth,
  HEALTH_STATUS,
  HealthSnapshot,
  loadVersionFromPkgJson,
  ServiceStatus,
  SUPERVISOR_SERVICE_STATES,
} from './health.ts';
