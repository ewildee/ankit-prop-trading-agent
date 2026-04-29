import { describe, expect, test } from 'bun:test';

import cassette from '../../test/cassettes/ftmo-2026-03-23-week.json';
import {
  type CalendarEvent,
  type CalendarFetcherDb,
  type CalendarFetcherLogger,
  createCalendarFetcher,
  DEFAULT_FTMO_CALENDAR_URL,
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function minimalEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
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
    }
    expect(seenUrls).toEqual([DEFAULT_FTMO_CALENDAR_URL]);
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
        return jsonResponse({ items: [minimalEvent()] });
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

  test('fails closed on Zod mismatch without persisting partial events', async () => {
    const db = new InMemoryCalendarDb();
    const { logger, records } = captureLogger();
    const fetcher = createCalendarFetcher({
      db,
      logger,
      clock: { nowUtc: () => NOW },
      fetch() {
        return jsonResponse({
          items: [minimalEvent({ impact: 'critical' as CalendarEvent['impact'] })],
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
