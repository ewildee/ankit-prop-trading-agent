import { describe, expect, test } from 'bun:test';
import type { TreatyClient } from '@ankit-prop/contracts';
import { assertExportsTreaty, NewsHealthSnapshot } from '@ankit-prop/contracts';
import type { FreshnessMonitor, FreshnessReason, FreshnessSnapshot } from '../freshness/index.ts';
import type { App } from '../index.ts';
import { healthRoute } from './health-route.ts';

const VERSION = '0.4.3';
const LAST_FETCH_AT = '2026-04-29T10:00:00.000Z';

describe('healthRoute', () => {
  test('GET /health/details returns 200 when the calendar is fresh', async () => {
    const app = healthRoute({
      freshness: fakeFreshness({
        ageSeconds: 60,
        fresh: true,
        lastFetchAtUtc: LAST_FETCH_AT,
        reason: 'fresh',
      }),
      version: VERSION,
    });

    const res = await app.handle(new Request('http://localhost/health/details'));
    expect(res.status).toBe(200);

    const body = NewsHealthSnapshot.parse(await res.json());
    expect(body).toEqual({
      ok: true,
      version: VERSION,
      fetchAgeSeconds: 60,
      freshReason: 'fresh',
      lastFetchAtUtc: LAST_FETCH_AT,
    });
  });

  test.each([
    ['never_fetched', Number.POSITIVE_INFINITY, null, 0],
    ['fetch_unhealthy', 300, LAST_FETCH_AT, 300],
    ['stale_calendar', 7_201, LAST_FETCH_AT, 7_201],
  ] satisfies ReadonlyArray<
    readonly [FreshnessReason, number, string | null, number]
  >)('GET /health/details returns 503 for %s', async (reason, ageSeconds, lastFetchAtUtc, expectedAge) => {
    const app = healthRoute({
      freshness: fakeFreshness({
        ageSeconds,
        fresh: false,
        lastFetchAtUtc,
        reason,
      }),
      version: VERSION,
    });

    const res = await app.handle(new Request('http://localhost/health/details'));
    expect(res.status).toBe(503);

    const body = NewsHealthSnapshot.parse(await res.json());
    expect(body).toEqual({
      ok: false,
      version: VERSION,
      fetchAgeSeconds: expectedAge,
      freshReason: reason,
      lastFetchAtUtc,
    });
  });

  test('service index exports a type-only Treaty App type', async () => {
    const sourceText = await Bun.file(new URL('../index.ts', import.meta.url)).text();

    expect(() =>
      assertExportsTreaty({
        modulePath: 'services/news/src/index.ts',
        sourceText,
      }),
    ).not.toThrow();
  });

  test('exported Treaty App type includes /health/details response shape', () => {
    type Client = TreatyClient<App>;
    type HealthDetailsResponse = Awaited<ReturnType<Client['health']['details']['get']>>['data'];

    const _typecheck: HealthDetailsResponse extends NewsHealthSnapshot | null ? true : false = true;
    expect(_typecheck).toBe(true);
  });
});

function fakeFreshness(snapshot: FreshnessSnapshot): FreshnessMonitor {
  return {
    currentSnapshot: () => snapshot,
  };
}
