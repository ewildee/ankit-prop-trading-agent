import { z } from 'zod';

export const HEALTH_STATUS = ['healthy', 'degraded', 'unhealthy'] as const;
export type HealthStatus = (typeof HEALTH_STATUS)[number];

export const HealthSnapshot = z.strictObject({
  service: z.string(),
  version: z.string(),
  build_sha: z.string().optional(),
  bun_version: z.string(),
  status: z.enum(HEALTH_STATUS),
  started_at: z.string(),
  uptime_seconds: z.number().int(),
  pid: z.number().int(),
  details: z.record(z.string(), z.unknown()),
  checked_at: z.string(),
});
export type HealthSnapshot = z.infer<typeof HealthSnapshot>;

export const SUPERVISOR_SERVICE_STATES = [
  'idle',
  'starting',
  'running',
  'unhealthy',
  'stopping',
  'stopped',
  'crashed',
  'circuit-broken',
  'adopted',
] as const;
export type SupervisorServiceState = (typeof SUPERVISOR_SERVICE_STATES)[number];

export const ServiceStatus = z.strictObject({
  name: z.string(),
  state: z.enum(SUPERVISOR_SERVICE_STATES),
  pid: z.number().int().nullable(),
  adopted: z.boolean(),
  startedAt: z.string().nullable(),
  restartCount: z.number().int(),
  crashesInWindow: z.number().int(),
  lastExitCode: z.number().int().nullable(),
  lastError: z.string().nullable(),
  health: HealthSnapshot.nullable(),
});
export type ServiceStatus = z.infer<typeof ServiceStatus>;

export const AggregatedHealth = z.strictObject({
  service: z.literal('proc-supervisor'),
  version: z.string(),
  bun_version: z.string(),
  status: z.enum(HEALTH_STATUS),
  started_at: z.string(),
  uptime_seconds: z.number().int(),
  pid: z.number().int(),
  checked_at: z.string(),
  mode: z.enum(['dev', 'prod']),
  services: z.array(ServiceStatus),
});
export type AggregatedHealth = z.infer<typeof AggregatedHealth>;

export function loadVersionFromPkgJson(pkgJson: { version?: string }): string {
  if (!pkgJson || typeof pkgJson.version !== 'string' || pkgJson.version.length === 0) {
    throw new Error('package.json missing string `version` field');
  }
  return pkgJson.version;
}
