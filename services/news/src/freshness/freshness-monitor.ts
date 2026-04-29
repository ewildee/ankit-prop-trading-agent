export const STALENESS_LIMIT_MS = 2 * 60 * 60 * 1_000;

export type FreshnessReason = 'fresh' | 'stale_calendar' | 'never_fetched' | 'fetch_unhealthy';

export interface FreshnessSnapshot {
  readonly ageSeconds: number;
  readonly fresh: boolean;
  readonly reason: FreshnessReason;
}

export interface FreshnessMonitorDb {
  getMeta(key: 'last_fetch_at' | 'last_fetch_ok'): string | null;
}

export interface FreshnessMonitorClock {
  nowUtc(): string;
}

export interface FreshnessMonitorLogger {
  warn?(payload: Record<string, unknown>, message?: string): void;
  error?(payload: Record<string, unknown>, message?: string): void;
}

export interface CreateFreshnessMonitorOptions {
  readonly db: FreshnessMonitorDb;
  readonly clock?: FreshnessMonitorClock;
  readonly logger?: FreshnessMonitorLogger;
}

export interface FreshnessMonitor {
  currentSnapshot(): FreshnessSnapshot;
}

const defaultClock: FreshnessMonitorClock = {
  nowUtc: () => new Date().toISOString(),
};

export function createFreshnessMonitor(opts: CreateFreshnessMonitorOptions): FreshnessMonitor {
  const clock = opts.clock ?? defaultClock;

  return {
    currentSnapshot(): FreshnessSnapshot {
      const lastFetchAt = opts.db.getMeta('last_fetch_at');
      const lastFetchOk = opts.db.getMeta('last_fetch_ok');

      if (lastFetchAt === null) {
        return {
          ageSeconds: Number.POSITIVE_INFINITY,
          fresh: false,
          reason: 'never_fetched',
        };
      }

      if (lastFetchOk === '0') {
        return {
          ageSeconds: computeAgeSeconds(clock.nowUtc(), lastFetchAt),
          fresh: false,
          reason: 'fetch_unhealthy',
        };
      }

      const ageMs = ageMsSince(clock.nowUtc(), lastFetchAt);
      const ageSeconds = ageSecondsFromMs(ageMs);

      if (!Number.isFinite(ageMs) || ageMs > STALENESS_LIMIT_MS) {
        return {
          ageSeconds,
          fresh: false,
          reason: 'stale_calendar',
        };
      }

      return {
        ageSeconds,
        fresh: true,
        reason: 'fresh',
      };
    },
  };
}

function computeAgeSeconds(nowUtc: string, lastFetchAt: string): number {
  return ageSecondsFromMs(ageMsSince(nowUtc, lastFetchAt));
}

function ageMsSince(nowUtc: string, lastFetchAt: string): number {
  return Date.parse(nowUtc) - Date.parse(lastFetchAt);
}

function ageSecondsFromMs(ageMs: number): number {
  if (!Number.isFinite(ageMs)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, ageMs / 1_000);
}
