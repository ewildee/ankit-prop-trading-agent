import { NewsHealthSnapshot } from '@ankit-prop/contracts';
import { Elysia } from 'elysia';
import type { FreshnessMonitor } from '../freshness/index.ts';

export interface HealthRouteClock {
  nowUtc(): string;
}

export interface HealthRouteOptions {
  readonly freshness: FreshnessMonitor;
  readonly clock?: HealthRouteClock;
  readonly version: string;
}

export function healthRoute(opts: HealthRouteOptions) {
  return new Elysia().get('/health/details', ({ set }) => {
    const freshness = opts.freshness.currentSnapshot();
    const body = NewsHealthSnapshot.parse({
      ok: freshness.fresh,
      version: opts.version,
      fetchAgeSeconds: finiteFetchAgeSeconds(freshness.ageSeconds),
      freshReason: freshness.reason,
      lastFetchAtUtc: freshness.lastFetchAtUtc,
    });

    if (!body.ok) set.status = 503;
    return body;
  });
}

export type HealthApp = ReturnType<typeof healthRoute>;

function finiteFetchAgeSeconds(ageSeconds: number): number {
  if (!Number.isFinite(ageSeconds)) {
    return 0;
  }
  return ageSeconds;
}
