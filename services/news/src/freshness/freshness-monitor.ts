export const STALENESS_LIMIT_MS = 2 * 60 * 60 * 1_000;

export type FreshnessReason = 'fresh' | 'stale_calendar' | 'never_fetched' | 'fetch_unhealthy';

export interface FreshnessSnapshot {
  readonly ageSeconds: number;
  readonly fresh: boolean;
  readonly lastFetchAtUtc: string | null;
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
  // Reserved for N9/N10 transition logging; currentSnapshot stays side-effect free.
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
          lastFetchAtUtc: null,
          reason: 'never_fetched',
        };
      }

      const nowUtc = clock.nowUtc();

      if (lastFetchOk !== '1') {
        return {
          ageSeconds: computeAgeSeconds(nowUtc, lastFetchAt),
          fresh: false,
          lastFetchAtUtc: lastFetchAt,
          reason: 'fetch_unhealthy',
        };
      }

      const ageMs = ageMsSince(nowUtc, lastFetchAt);
      const ageSeconds = ageSecondsFromMs(ageMs);

      if (ageMs < 0) {
        return {
          ageSeconds,
          fresh: false,
          lastFetchAtUtc: lastFetchAt,
          reason: 'fetch_unhealthy',
        };
      }

      if (!Number.isFinite(ageMs) || ageMs > STALENESS_LIMIT_MS) {
        return {
          ageSeconds,
          fresh: false,
          lastFetchAtUtc: lastFetchAt,
          reason: 'stale_calendar',
        };
      }

      return {
        ageSeconds,
        fresh: true,
        lastFetchAtUtc: lastFetchAt,
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
