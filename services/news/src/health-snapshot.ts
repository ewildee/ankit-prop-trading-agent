import type { HealthSnapshot, HealthStatus } from '@ankit-prop/contracts';

const STALE_AFTER_SECONDS = 2 * 60 * 60;

export interface FetcherHealthSnapshot {
  readonly lastFetchAt: string | null;
  readonly ageSeconds: number | null;
  readonly dbOk: boolean;
}

export interface NewsHealthSnapshotOptions {
  readonly version: string;
  readonly startedAtMs: number;
  readonly fetcherHealth: FetcherHealthSnapshot | (() => FetcherHealthSnapshot);
  readonly now?: () => number;
}

export function buildNewsHealthSnapshot(opts: NewsHealthSnapshotOptions): HealthSnapshot {
  const now = (opts.now ?? Date.now)();
  const health = getHealth(opts.fetcherHealth);
  const status = statusFor(health);

  return {
    service: 'news',
    version: opts.version,
    bun_version: Bun.version,
    status,
    started_at: new Date(opts.startedAtMs).toISOString(),
    uptime_seconds: Math.max(0, Math.floor((now - opts.startedAtMs) / 1000)),
    pid: process.pid,
    details: {
      dbOk: health.dbOk,
      lastFetchAt: health.lastFetchAt,
      ageSeconds: health.ageSeconds,
      blueprint_section: '19.0',
    },
    checked_at: new Date(now).toISOString(),
  };
}

export function isCalendarFresh(health: FetcherHealthSnapshot): boolean {
  return health.dbOk && health.ageSeconds !== null && health.ageSeconds <= STALE_AFTER_SECONDS;
}

function statusFor(health: FetcherHealthSnapshot): HealthStatus {
  if (!health.dbOk) return 'unhealthy';
  if (!isCalendarFresh(health)) return 'degraded';
  return 'healthy';
}

function getHealth(
  health: FetcherHealthSnapshot | (() => FetcherHealthSnapshot),
): FetcherHealthSnapshot {
  return typeof health === 'function' ? health() : health;
}
