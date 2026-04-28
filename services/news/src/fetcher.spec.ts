import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type CalendarItem, CalendarResponse } from '@ankit-prop/contracts/news';
import { closeCalendarDb, openCalendarDb, queryRange } from './calendar-db.ts';
import { buildCalendarUrl, createFetcher, type FetcherClock } from './fetcher.ts';

const NOW = Date.UTC(2026, 3, 14, 12, 0, 0);
const CASSETTE_PATH = join(import.meta.dir, '..', 'test', 'cassettes', 'ftmo-2026-03-23-week.json');

const BASE_ITEM: CalendarItem = {
  title: 'US Non-Farm Payrolls',
  impact: 'high',
  instrument: 'USD + US Indices + XAUUSD + DXY',
  restriction: true,
  eventType: 'normal',
  date: '2026-04-28T14:30:00+02:00',
  forecast: null,
  previous: null,
  actual: null,
  youtubeLink: null,
  articleLink: null,
};

describe('news fetcher', () => {
  test('cassette replay validates and upserts items from the first start fetch', async () => {
    const cassette = await loadCassette();
    await withTempDb(async (db) => {
      const clock = new ManualClock(NOW);
      const logger = captureLogger();
      const calls: URL[] = [];
      const fetcher = createFetcher({
        db,
        clock,
        logger,
        fetch: sequenceFetch(calls, [jsonResponse(cassette)]),
      });

      await fetcher.start();
      const rows = queryRange(db, '2026-03-23T00:00:00+01:00', '2026-04-06T00:00:00+02:00');

      expect(rows.length).toBe(cassette.items.length);
      expect(fetcher.getHealth()).toEqual({
        lastSuccessAt: NOW,
        lastErrorAt: null,
        consecutiveFailures: 0,
        ageSeconds: 0,
      });
      expect(clock.intervals.map((interval) => interval.intervalMs)).toEqual([30 * 60_000]);
      expect(calls[0]?.searchParams.get('dateFrom')).toBe('2026-04-14T14:00:00+02:00');
      expect(calls[0]?.searchParams.get('dateTo')).toBe('2026-04-28T14:00:00+02:00');
      expect(calls[0]?.searchParams.get('timezone')).toBe('Europe/Prague');

      fetcher.stop();
      expect(clock.intervals[0]?.cleared).toBe(true);
    });
  });

  test('5xx responses retry with 1s then 4s backoff before a successful upsert', async () => {
    await withTempDb(async (db) => {
      const clock = new ManualClock(NOW);
      const logger = captureLogger();
      const calls: URL[] = [];
      const fetcher = createFetcher({
        db,
        clock,
        logger,
        fetch: sequenceFetch(calls, [
          new Response('temporary', { status: 503 }),
          new Response('still temporary', { status: 502 }),
          jsonResponse({ items: [BASE_ITEM] }),
        ]),
      });

      await fetcher.start();

      expect(clock.sleeps).toEqual([1_000, 4_000]);
      expect(calls.length).toBe(3);
      expect(fetcher.getHealth()).toMatchObject({
        lastSuccessAt: NOW + 5_000,
        consecutiveFailures: 0,
      });
      expect(queryRange(db, '2026-04-28T00:00:00+02:00', '2026-04-29T00:00:00+02:00')).toEqual([
        BASE_ITEM,
      ]);
      expect(logger.warns.filter((entry) => entry.kind === 'news_fetch_unhealthy')).toEqual([]);
    });
  });

  test('schema mismatch fails closed without persisting rows', async () => {
    await withTempDb(async (db) => {
      const clock = new ManualClock(NOW);
      const logger = captureLogger();
      const fetcher = createFetcher({
        db,
        clock,
        logger,
        fetch: sequenceFetch([], [jsonResponse({ items: [{ ...BASE_ITEM, impact: 'critical' }] })]),
      });

      await fetcher.start();

      expect(fetcher.getHealth()).toEqual({
        lastSuccessAt: null,
        lastErrorAt: NOW,
        consecutiveFailures: 1,
        ageSeconds: null,
      });
      expect(queryRange(db, '2026-04-28T00:00:00+02:00', '2026-04-29T00:00:00+02:00')).toEqual([]);
      expect(logger.errors[0]?.kind).toBe('news_fetch_schema_mismatch');
    });
  });

  test('empty items response is treated as a fail-closed contract violation', async () => {
    await withTempDb(async (db) => {
      const clock = new ManualClock(NOW);
      const logger = captureLogger();
      const fetcher = createFetcher({
        db,
        clock,
        logger,
        fetch: sequenceFetch([], [jsonResponse({ items: [] })]),
      });

      await fetcher.start();

      expect(queryRange(db, '2026-04-14T14:00:00+02:00', '2026-04-28T14:00:00+02:00')).toEqual([]);
      expect(fetcher.getHealth()).toEqual({
        lastSuccessAt: null,
        lastErrorAt: NOW,
        consecutiveFailures: 1,
        ageSeconds: null,
      });
      expect(logger.errors[0]?.kind).toBe('news_fetch_empty_items');
      expect(logger.errors[0]?.window).toMatchObject({
        dateFrom: '2026-04-14T14:00:00+02:00',
        dateTo: '2026-04-28T14:00:00+02:00',
        timezone: 'Europe/Prague',
      });
      expect(logger.warns.filter((entry) => entry.kind === 'news_fetch_unhealthy')).toEqual([]);
    });
  });

  test('three consecutive empty-items failures emit one unhealthy alert', async () => {
    await withTempDb(async (db) => {
      const clock = new ManualClock(NOW);
      const logger = captureLogger();
      const fetcher = createFetcher({
        db,
        clock,
        logger,
        fetch: sequenceFetch(
          [],
          [
            jsonResponse({ items: [] }),
            jsonResponse({ items: [] }),
            jsonResponse({ items: [] }),
            jsonResponse({ items: [] }),
          ],
        ),
      });

      await fetcher.start();
      await clock.tick();
      await clock.tick();
      await clock.tick();

      expect(fetcher.getHealth().consecutiveFailures).toBe(4);
      expect(logger.errors.map((entry) => entry.kind)).toEqual([
        'news_fetch_empty_items',
        'news_fetch_empty_items',
        'news_fetch_empty_items',
        'news_fetch_empty_items',
      ]);
      expect(logger.warns.filter((entry) => entry.kind === 'news_fetch_unhealthy')).toEqual([
        { kind: 'news_fetch_unhealthy', consecutive: 3 },
      ]);
    });
  });
});

describe('buildCalendarUrl', () => {
  test('renders explicit Europe/Prague offset query params', () => {
    const url = buildCalendarUrl('https://example.test/calendar', NOW, 14);

    expect(url.toString()).toBe(
      'https://example.test/calendar?dateFrom=2026-04-14T14%3A00%3A00%2B02%3A00&dateTo=2026-04-28T14%3A00%3A00%2B02%3A00&timezone=Europe%2FPrague',
    );
  });
});

async function loadCassette(): Promise<{ items: CalendarItem[] }> {
  return CalendarResponse.parse(await Bun.file(CASSETTE_PATH).json());
}

async function withTempDb(assertions: (db: ReturnType<typeof openCalendarDb>) => Promise<void>) {
  const tmp = await mkdtemp(join(tmpdir(), 'news-fetcher-'));
  const db = openCalendarDb(join(tmp, 'calendar.db'));
  try {
    await assertions(db);
  } finally {
    closeCalendarDb(db);
    await rm(tmp, { recursive: true, force: true });
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function sequenceFetch(calls: URL[], responses: (Response | Error)[]): typeof fetch {
  return (async (input: RequestInfo | URL): Promise<Response> => {
    calls.push(new URL(input.toString()));
    const next = responses.shift();
    if (next === undefined) {
      throw new Error('unexpected fetch call');
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }) as typeof fetch;
}

function captureLogger() {
  const errors: Record<string, unknown>[] = [];
  const warns: Record<string, unknown>[] = [];
  const infos: Record<string, unknown>[] = [];
  return {
    errors,
    warns,
    infos,
    error(fields: Record<string, unknown>) {
      errors.push(fields);
    },
    warn(fields: Record<string, unknown>) {
      warns.push(fields);
    },
    info(fields: Record<string, unknown>) {
      infos.push(fields);
    },
  };
}

class ManualClock implements FetcherClock {
  currentMs: number;
  readonly sleeps: number[] = [];
  readonly intervals: { fn: () => void | Promise<void>; intervalMs: number; cleared: boolean }[] =
    [];

  constructor(nowMs: number) {
    this.currentMs = nowMs;
  }

  now(): number {
    return this.currentMs;
  }

  setInterval(fn: () => void | Promise<void>, intervalMs: number): unknown {
    const interval = { fn, intervalMs, cleared: false };
    this.intervals.push(interval);
    return interval;
  }

  clearInterval(handle: unknown): void {
    (handle as { cleared: boolean }).cleared = true;
  }

  async sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    this.currentMs += ms;
  }

  async tick(index = 0): Promise<void> {
    const interval = this.intervals[index];
    if (!interval || interval.cleared) {
      throw new Error(`interval ${index} is not active`);
    }
    await interval.fn();
  }
}
