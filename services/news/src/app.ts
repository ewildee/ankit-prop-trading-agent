import { HealthSnapshot, type HealthStatus } from '@ankit-prop/contracts';
import { Elysia } from 'elysia';
import type { FreshnessMonitor } from './freshness/index.ts';
import { healthRoute } from './health/index.ts';
import { metricsRoute, NewsMetrics } from './metrics.ts';
import {
  type CalendarRouteClock,
  type CalendarRouteDb,
  calendarRoutes,
} from './routes/calendar.ts';
import type { SymbolTagMap, SymbolTagMapLogger } from './symbol-tag-mapper.ts';

export interface BuildNewsAppOptions {
  readonly db: CalendarRouteDb;
  readonly freshness: FreshnessMonitor;
  readonly mapper: SymbolTagMap;
  readonly metrics?: NewsMetrics;
  readonly logger?: SymbolTagMapLogger;
  readonly version: string;
  readonly startedAtMs: number;
  readonly clock?: CalendarRouteClock;
}

export function buildNewsApp(options: BuildNewsAppOptions) {
  const clock = options.clock ?? defaultClock;
  const metrics = options.metrics ?? new NewsMetrics({ freshness: options.freshness });

  const routesOptions: BuildNewsAppOptions = options.logger
    ? options
    : {
        db: options.db,
        freshness: options.freshness,
        mapper: options.mapper,
        metrics,
        version: options.version,
        startedAtMs: options.startedAtMs,
        clock,
      };

  return new Elysia()
    .get('/health', ({ set }) => {
      const snapshot = options.freshness.currentSnapshot();
      const status: HealthStatus = snapshot.fresh ? 'healthy' : 'unhealthy';
      if (status === 'unhealthy') set.status = 503;

      const now = clock.now();
      return HealthSnapshot.parse({
        service: 'news',
        version: options.version,
        bun_version: Bun.version,
        status,
        started_at: new Date(options.startedAtMs).toISOString(),
        uptime_seconds: Math.max(0, Math.floor((now - options.startedAtMs) / 1_000)),
        pid: process.pid,
        details: {
          last_successful_fetch_at: snapshot.lastFetchAtUtc,
          fetch_age_seconds: finiteFetchAgeSeconds(snapshot.ageSeconds),
          fresh_reason: snapshot.reason,
          blueprint_section: '19.2',
        },
        checked_at: new Date(now).toISOString(),
      });
    })
    .use(
      healthRoute({
        freshness: options.freshness,
        version: options.version,
      }),
    )
    .use(
      calendarRoutes({
        db: routesOptions.db,
        freshness: routesOptions.freshness,
        mapper: routesOptions.mapper,
        clock,
        ...(routesOptions.logger ? { logger: routesOptions.logger } : {}),
      }),
    )
    .use(metricsRoute(metrics));
}

export type NewsApp = ReturnType<typeof buildNewsApp>;

function finiteFetchAgeSeconds(ageSeconds: number): number {
  if (!Number.isFinite(ageSeconds)) return 0;
  return ageSeconds;
}

const defaultClock: CalendarRouteClock = {
  now: () => Date.now(),
  nowUtc: () => new Date().toISOString(),
};
