import { describe, expect, test } from 'bun:test';

import { CalendarItem, type CalendarItem as CalendarItemType } from '@ankit-prop/contracts';

import cassette from '../../test/cassettes/ftmo-2026-03-23-week.json';
import {
  type CalendarEvent,
  type CalendarFetcherDb,
  type CalendarFetcherLogger,
  createCalendarFetcher,
  DEFAULT_FTMO_CALENDAR_URL,
  mapCalendarItemToEvent,
} from './index.ts';

const NOW = '2026-04-29T07:30:00.000Z';

class InMemoryCalendarDb implements CalendarFetcherDb {
  readonly meta = new Map<string, string>();
  readonly rows: CalendarEvent[] = [];
  readonly upserts: { events: readonly CalendarEvent[]; fetchedAt: string }[] = [];

  upsertEvents(events: readonly CalendarEvent[], fetchedAt: string): void {
    this.upserts.push({ events, fetchedAt });
    this.rows.push(...events);
  }

  setMeta(key: 'last_fetch_at' | 'last_fetch_ok', value: string): void {
    this.meta.set(key, value);
  }
}

class FailingUpsertCalendarDb extends InMemoryCalendarDb {
  override upsertEvents(): void {
    throw new Error('sqlite locked');
  }
}

class FailingMarkFailedCalendarDb extends InMemoryCalendarDb {
  override setMeta(key: 'last_fetch_at' | 'last_fetch_ok', value: string): void {
    if (key === 'last_fetch_ok' && value === '0') {
      throw new Error('meta store offline');
    }
    super.setMeta(key, value);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function minimalItem(overrides: Partial<CalendarItemType> = {}): CalendarItemType {
  return {
    title: 'Non-Farm Employment Change',
    impact: 'high',
    instrument: 'USD + US Indices + XAUUSD + DXY',
    restriction: true,
    eventType: 'normal',
    date: '2026-04-03T14:30:00+02:00',
    forecast: '65 K',
    previous: '-92 K',
    actual: null,
    youtubeLink: 'https://www.youtube.com/watch?v=oQwt0cXetzo',
    articleLink: 'https://ftmo.com/en/economic-calendar-watch-out-for-volatility-during-nfp/',
    ...overrides,
  };
}

function captureLogger(): { logger: CalendarFetcherLogger; records: Record<string, unknown>[] } {
  const records: Record<string, unknown>[] = [];
  return {
    records,
    logger: {
      warn(payload, message) {
        records.push({ ...payload, message });
      },
      error(payload, message) {
        records.push({ ...payload, message });
      },
    },
  };
}

function expectPragueWindowUrl(rawUrl: string): void {
  const url = new URL(rawUrl);
  expect(`${url.origin}${url.pathname}`).toBe(DEFAULT_FTMO_CALENDAR_URL);
  expect(url.searchParams.get('dateFrom')).toBe('2026-04-29T09:30:00+02:00');
  expect(url.searchParams.get('dateTo')).toBe('2026-05-13T09:30:00+02:00');
  expect(url.searchParams.get('timezone')).toBe('Europe/Prague');
}

describe('createCalendarFetcher.fetchOnce', () => {
  test('persists valid FTMO cassette JSON and marks the fetch healthy', async () => {
    const db = new InMemoryCalendarDb();
    const seenUrls: string[] = [];
    const fetcher = createCalendarFetcher({
      db,
      clock: { nowUtc: () => NOW },
      fetch(input) {
        seenUrls.push(String(input));
        return jsonResponse(cassette);
      },
    });

    const result = await fetcher.fetchOnce();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fetchedAt).toBe(NOW);
      expect(result.events.length).toBeGreaterThan(100);
      expect(result.events[0]).toEqual(
        mapCalendarItemToEvent(CalendarItem.parse(cassette.items[0])),
      );
    }
    expect(seenUrls).toHaveLength(1);
    expectPragueWindowUrl(seenUrls[0] ?? '');
    expect(db.upserts).toHaveLength(1);
    expect(db.rows.length).toBeGreaterThan(100);
    expect(db.meta.get('last_fetch_at')).toBe(NOW);
    expect(db.meta.get('last_fetch_ok')).toBe('1');
  });

  test('retries 5xx responses and succeeds after two backoffs', async () => {
    const db = new InMemoryCalendarDb();
    const sleeps: number[] = [];
    let calls = 0;
    const fetcher = createCalendarFetcher({
      db,
      clock: {
        nowUtc: () => NOW,
        sleep(ms) {
          sleeps.push(ms);
        },
      },
      fetch() {
        calls += 1;
        if (calls <= 2) {
          return jsonResponse({ error: 'temporary' }, 503);
        }
        return jsonResponse({ items: [minimalItem()] });
      },
    });

    const result = await fetcher.fetchOnce();

    expect(result.ok).toBe(true);
    expect(calls).toBe(3);
    expect(sleeps).toEqual([1_000, 4_000]);
    expect(db.rows).toHaveLength(1);
    expect(db.meta.get('last_fetch_ok')).toBe('1');
  });

  test('marks persistent 5xx unhealthy after three failed responses', async () => {
    const db = new InMemoryCalendarDb();
    const sleeps: number[] = [];
    const { logger, records } = captureLogger();
    let calls = 0;
    const fetcher = createCalendarFetcher({
      db,
      logger,
      clock: {
        nowUtc: () => NOW,
        sleep(ms) {
          sleeps.push(ms);
        },
      },
      fetch() {
        calls += 1;
        return jsonResponse({ error: 'down' }, 500);
      },
    });

    const result = await fetcher.fetchOnce();

    expect(result).toEqual({ ok: false, reason: 'persistent_5xx' });
    expect(calls).toBe(3);
    expect(sleeps).toEqual([1_000, 4_000]);
    expect(db.rows).toEqual([]);
    expect(db.meta.get('last_fetch_at')).toBeUndefined();
    expect(db.meta.get('last_fetch_ok')).toBe('0');
    expect(records).toContainEqual({
      event: 'fetcher.persistent_5xx',
      status: 500,
      attempts: 3,
      message: 'fetcher.persistent_5xx',
    });
  });

  test('does not retry or persist rows on 4xx contract drift', async () => {
    const db = new InMemoryCalendarDb();
    let calls = 0;
    const fetcher = createCalendarFetcher({
      db,
      clock: { nowUtc: () => NOW },
      fetch() {
        calls += 1;
        return jsonResponse({ error: 'not found' }, 404);
      },
    });

    const result = await fetcher.fetchOnce();

    expect(result).toEqual({ ok: false, reason: 'http_4xx' });
    expect(calls).toBe(1);
    expect(db.rows).toEqual([]);
    expect(db.meta.get('last_fetch_at')).toBeUndefined();
    expect(db.meta.get('last_fetch_ok')).toBe('0');
  });

  test('treats an empty populated 14-day window as unhealthy', async () => {
    const db = new InMemoryCalendarDb();
    const { logger, records } = captureLogger();
    const fetcher = createCalendarFetcher({
      db,
      logger,
      clock: { nowUtc: () => NOW },
      fetch() {
        return jsonResponse({ items: [] });
      },
    });

    const result = await fetcher.fetchOnce();

    expect(result).toEqual({ ok: false, reason: 'empty_window' });
    expect(db.upserts).toEqual([]);
    expect(db.rows).toEqual([]);
    expect(db.meta.get('last_fetch_at')).toBeUndefined();
    expect(db.meta.get('last_fetch_ok')).toBe('0');
    expect(records).toContainEqual({
      event: 'fetcher.empty_window',
      dateFrom: '2026-04-29T09:30:00+02:00',
      dateTo: '2026-05-13T09:30:00+02:00',
      message: 'fetcher.empty_window',
    });
  });

  test('fails closed on Zod mismatch without persisting partial events', async () => {
    const db = new InMemoryCalendarDb();
    const { logger, records } = captureLogger();
    const fetcher = createCalendarFetcher({
      db,
      logger,
      clock: { nowUtc: () => NOW },
      fetch() {
        return jsonResponse({
          items: [minimalItem({ impact: 'critical' as CalendarItemType['impact'] })],
        });
      },
    });

    const result = await fetcher.fetchOnce();

    expect(result).toEqual({ ok: false, reason: 'schema_mismatch' });
    expect(db.rows).toEqual([]);
    expect(db.upserts).toEqual([]);
    expect(db.meta.get('last_fetch_at')).toBeUndefined();
    expect(db.meta.get('last_fetch_ok')).toBe('0');
    expect(records).toContainEqual({
      event: 'fetcher.schema_mismatch',
      path: 'items.0.impact',
      message: 'fetcher.schema_mismatch',
    });
  });

  test('fails closed when a validated item cannot map to a persisted event', async () => {
    const db = new InMemoryCalendarDb();
    const { logger, records } = captureLogger();
    const fetcher = createCalendarFetcher({
      db,
      logger,
      clock: { nowUtc: () => NOW },
      fetch() {
        return jsonResponse({ items: [minimalItem({ date: 'not-a-date' })] });
      },
    });

    const result = await fetcher.fetchOnce();

    expect(result).toEqual({ ok: false, reason: 'schema_mismatch' });
    expect(db.rows).toEqual([]);
    expect(db.upserts).toEqual([]);
    expect(db.meta.get('last_fetch_at')).toBeUndefined();
    expect(db.meta.get('last_fetch_ok')).toBe('0');
    expect(records).toContainEqual({
      event: 'fetcher.schema_mismatch',
      path: 'date',
      reason: 'calendar item date: invalid date: not-a-date',
      message: 'fetcher.schema_mismatch',
    });
  });

  test('marks rejected fetches unhealthy', async () => {
    const db = new InMemoryCalendarDb();
    const { logger, records } = captureLogger();
    let calls = 0;
    const fetcher = createCalendarFetcher({
      db,
      logger,
      clock: { nowUtc: () => NOW },
      fetch() {
        calls += 1;
        throw new Error('dns failure');
      },
    });

    const result = await fetcher.fetchOnce();

    expect(result).toEqual({ ok: false, reason: 'fetch_error' });
    expect(calls).toBe(1);
    expect(db.rows).toEqual([]);
    expect(db.meta.get('last_fetch_at')).toBeUndefined();
    expect(db.meta.get('last_fetch_ok')).toBe('0');
    expect(records.some((record) => record.event === 'fetcher.fetch_error')).toBe(true);
  });

  test('marks persistence failures unhealthy instead of leaving the previous healthy state', async () => {
    const db = new FailingUpsertCalendarDb();
    const { logger, records } = captureLogger();
    const fetcher = createCalendarFetcher({
      db,
      logger,
      clock: { nowUtc: () => NOW },
      fetch() {
        return jsonResponse({ items: [minimalItem()] });
      },
    });

    const result = await fetcher.fetchOnce();

    expect(result).toEqual({ ok: false, reason: 'persist_error' });
    expect(db.rows).toEqual([]);
    expect(db.meta.get('last_fetch_at')).toBeUndefined();
    expect(db.meta.get('last_fetch_ok')).toBe('0');
    expect(records.some((record) => record.event === 'fetcher.persist_error')).toBe(true);
  });

  const failedMetaCases: readonly {
    readonly name: string;
    readonly reason: 'persistent_5xx' | 'http_4xx' | 'schema_mismatch';
    readonly response: () => Response;
  }[] = [
    {
      name: 'persistent 5xx',
      reason: 'persistent_5xx',
      response: () => jsonResponse({ error: 'down' }, 500),
    },
    {
      name: 'HTTP 4xx',
      reason: 'http_4xx',
      response: () => jsonResponse({ error: 'bad request' }, 400),
    },
    {
      name: 'JSON parse failure',
      reason: 'schema_mismatch',
      response: () => new Response('{not-json', { status: 200 }),
    },
    {
      name: 'Zod schema mismatch',
      reason: 'schema_mismatch',
      response: () =>
        jsonResponse({
          items: [minimalItem({ impact: 'critical' as CalendarItemType['impact'] })],
        }),
    },
  ];

  for (const failureCase of failedMetaCases) {
    test(`does not reject when mark-failed metadata write fails on ${failureCase.name}`, async () => {
      const db = new FailingMarkFailedCalendarDb();
      const { logger, records } = captureLogger();
      const fetcher = createCalendarFetcher({
        db,
        logger,
        clock: {
          nowUtc: () => NOW,
          sleep() {},
        },
        fetch() {
          return failureCase.response();
        },
      });

      const result = await fetcher.fetchOnce();

      expect(result).toEqual({ ok: false, reason: failureCase.reason });
      expect(records.some((record) => record.event === 'fetcher.mark_failed_error')).toBe(true);
    });
  }
});

describe('createCalendarFetcher.start/stop', () => {
  test('runs immediately, schedules a 30-minute cadence, and clears the interval on stop', () => {
    const db = new InMemoryCalendarDb();
    const intervals: { callback: () => void; ms: number }[] = [];
    const cleared: unknown[] = [];
    let calls = 0;
    const fetcher = createCalendarFetcher({
      db,
      clock: {
        nowUtc: () => NOW,
        setInterval(callback, ms) {
          intervals.push({ callback, ms });
          return { id: intervals.length };
        },
        clearInterval(handle) {
          cleared.push(handle);
        },
      },
      fetch() {
        calls += 1;
        return jsonResponse({ items: [] });
      },
    });

    fetcher.start();
    expect(calls).toBe(1);
    expect(intervals).toHaveLength(1);
    expect(intervals[0]?.ms).toBe(30 * 60 * 1_000);

    intervals[0]?.callback();
    expect(calls).toBe(2);

    fetcher.stop();
    expect(cleared).toHaveLength(1);

    intervals[0]?.callback();
    expect(calls).toBe(3);
  });
});
