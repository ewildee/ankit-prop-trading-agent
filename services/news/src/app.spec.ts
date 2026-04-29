import { describe, expect, test } from 'bun:test';
import { type CalendarItem, createTreatyClient, HealthSnapshot } from '@ankit-prop/contracts';
import { buildNewsApp } from './app.ts';
import type { FreshnessMonitor, FreshnessSnapshot } from './freshness/index.ts';
import type { SymbolTagMap } from './symbol-tag-mapper.ts';

const STARTED_AT = Date.parse('2026-04-29T10:00:00.000Z');
const CHECKED_AT = STARTED_AT + 5_000;
const VERSION = '0.4.4';

describe('buildNewsApp', () => {
  test('GET /health returns canonical HealthSnapshot with service version', async () => {
    const app = buildNewsApp({
      db: fakeDb(),
      freshness: freshness({
        ageSeconds: 30,
        fresh: true,
        lastFetchAtUtc: '2026-04-29T09:59:30.000Z',
        reason: 'fresh',
      }),
      mapper: map(),
      version: VERSION,
      startedAtMs: STARTED_AT,
      clock: { now: () => CHECKED_AT, nowUtc: () => new Date(CHECKED_AT).toISOString() },
    });

    const res = await app.handle(new Request('http://news.test/health'));

    expect(res.status).toBe(200);
    const body = HealthSnapshot.parse(await res.json());
    expect(body.service).toBe('news');
    expect(body.version).toBe(VERSION);
    expect(body.status).toBe('healthy');
    expect(body.uptime_seconds).toBe(5);
    expect(body.details.fetch_age_seconds).toBe(30);
  });

  test('GET /health returns 503 when freshness is unhealthy', async () => {
    const app = buildNewsApp({
      db: fakeDb(),
      freshness: freshness({
        ageSeconds: Number.POSITIVE_INFINITY,
        fresh: false,
        lastFetchAtUtc: null,
        reason: 'never_fetched',
      }),
      mapper: map(),
      version: VERSION,
      startedAtMs: STARTED_AT,
      clock: { now: () => CHECKED_AT, nowUtc: () => new Date(CHECKED_AT).toISOString() },
    });

    const res = await app.handle(new Request('http://news.test/health'));

    expect(res.status).toBe(503);
    const body = HealthSnapshot.parse(await res.json());
    expect(body.status).toBe('unhealthy');
    expect(body.details.fresh_reason).toBe('never_fetched');
  });

  test('default clock supports health and calendar routes when no clock is injected', async () => {
    const app = buildNewsApp({
      db: fakeDb(),
      freshness: freshness({
        ageSeconds: 60,
        fresh: true,
        lastFetchAtUtc: new Date().toISOString(),
        reason: 'fresh',
      }),
      mapper: map(),
      version: VERSION,
      startedAtMs: Date.now(),
    });

    const health = await app.handle(new Request('http://news.test/health'));
    const preNews = await app.handle(
      new Request('http://news.test/calendar/pre-news-2h?instruments=XAUUSD'),
    );

    expect(health.status).toBe(200);
    const body = HealthSnapshot.parse(await health.json());
    expect(body.details.fetch_age_seconds).toBe(60);
    expect(preNews.status).toBe(200);
  });

  test('exported app type round-trips through the Treaty client against the composed app', async () => {
    const app = buildNewsApp({
      db: fakeDb(),
      freshness: freshness({
        ageSeconds: 30,
        fresh: true,
        lastFetchAtUtc: '2026-04-29T09:59:30.000Z',
        reason: 'fresh',
      }),
      mapper: map(),
      version: VERSION,
      startedAtMs: STARTED_AT,
      clock: { now: () => CHECKED_AT, nowUtc: () => new Date(CHECKED_AT).toISOString() },
    });
    type NewsApp = typeof app;

    const originalFetch = globalThis.fetch;
    const handledRequests: string[] = [];
    globalThis.fetch = ((input, init) => {
      const request = new Request(input, init);
      handledRequests.push(new URL(request.url).pathname);
      return app.handle(request);
    }) as typeof fetch;

    try {
      const client = createTreatyClient<NewsApp>('http://news.test');
      const result = await client.health.get();

      expect(result.status).toBe(200);
      expect(result.error).toBeNull();
      expect(result.data?.service).toBe('news');
      expect(handledRequests).toEqual(['/health']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function fakeDb() {
  const events: CalendarItem[] = [];
  return {
    selectEventsBetween: () => events,
    selectEventsForPragueDay: () => events,
  };
}

function freshness(snapshot: FreshnessSnapshot): FreshnessMonitor {
  return {
    currentSnapshot: () => snapshot,
  };
}

function map(): SymbolTagMap {
  return { mappings: { USD: { affects: ['XAUUSD'] } } };
}
