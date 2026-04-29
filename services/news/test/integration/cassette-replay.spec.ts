import { describe, expect, test } from 'bun:test';

import { CalendarItem, CalendarResponse, RestrictedReply } from '@ankit-prop/contracts';

import { buildNewsApp } from '../../src/app.ts';
import { openCalendarDb } from '../../src/db/calendar-db.ts';
import { createCalendarFetcher, mapCalendarItemToEvent } from '../../src/fetcher/index.ts';
import { createFreshnessMonitor } from '../../src/freshness/index.ts';
import type { SymbolTagMap } from '../../src/symbol-tag-mapper.ts';
import cassette from '../cassettes/ftmo-2026-03-23-week.json';

const FETCHED_AT = '2026-03-23T00:00:00.000Z';
const STARTED_AT_MS = Date.parse(FETCHED_AT);
const TRACKED_SYMBOLS = ['NAS100', 'XAUUSD'] as const;
const TAG_MAP: SymbolTagMap = {
  mappings: {
    USD: { affects: ['NAS100', 'XAUUSD'] },
    'US Indices': { affects: ['NAS100'] },
    NAS100: { affects: ['NAS100'] },
    Gold: { affects: ['XAUUSD'] },
    XAUUSD: { affects: ['XAUUSD'] },
    DXY: { affects: [] },
    EUR: { affects: [] },
    GBP: { affects: [] },
    CAD: { affects: [] },
    AUD: { affects: [] },
    NZD: { affects: [] },
    CHF: { affects: [] },
    'Crude Oil': { affects: [] },
  },
};

describe('news app cassette replay', () => {
  test('replays the 14-day FTMO cassette through fetcher storage and calendar endpoints', async () => {
    const parsed = CalendarResponse.parse(cassette);
    const expectedEvents = parsed.items.map(mapCalendarItemToEvent);
    const db = openCalendarDb({
      path: ':memory:',
      clock: { now: () => new Date(FETCHED_AT) },
    });

    try {
      const fetcher = createCalendarFetcher({
        db,
        clock: { nowUtc: () => FETCHED_AT },
        fetch: () => jsonResponse(cassette),
      });

      const replay = await fetcher.fetchOnce();

      expect(replay.ok).toBe(true);
      if (!replay.ok) throw new Error(`cassette replay failed: ${replay.reason}`);
      expect(replay.events).toHaveLength(parsed.items.length);
      expect(replay.events[0]).toEqual(expectedEvents[0]);
      expect(replay.events.at(-1)).toEqual(expectedEvents.at(-1));
      expect(db.getMeta('last_fetch_at')).toBe(FETCHED_AT);
      expect(db.getMeta('last_fetch_ok')).toBe('1');

      const app = buildNewsApp({
        db,
        freshness: createFreshnessMonitor({
          db,
          clock: { nowUtc: () => FETCHED_AT },
        }),
        mapper: TAG_MAP,
        version: '0.0.0-test',
        startedAtMs: STARTED_AT_MS,
        clock: { now: () => STARTED_AT_MS, nowUtc: () => FETCHED_AT },
      });

      const first = expectedEvents[0];
      const last = expectedEvents.at(-1);
      if (!first || !last) throw new Error('cassette fixture unexpectedly empty');

      const windowBody = await getJson(
        app,
        `/calendar/window?from=${encodeURIComponent(first.eventTsUtc)}&to=${encodeURIComponent(
          last.eventTsUtc,
        )}&instruments=NAS100&instruments=XAUUSD`,
      );
      expect(windowBody).toHaveLength(
        expectedEvents.filter((event) => affectedSymbols(event.instrument).length > 0).length,
      );

      const aprilThird = CalendarItem.array().parse(
        await getJson(app, '/calendar/by-day?day=2026-04-03'),
      );
      expect(aprilThird.map((item: { title: string }) => item.title)).toEqual(
        expect.arrayContaining([
          'Average Hourly Earnings m/m',
          'Unemployment Rate',
          'Non-Farm Employment Change',
        ]),
      );

      const restrictedSnapshots = expectedEvents.flatMap((event) =>
        event.restricted
          ? affectedSymbols(event.instrument).map((symbol) => ({ event, symbol }))
          : [],
      );
      expect(restrictedSnapshots).toHaveLength(2);
      for (const snapshot of restrictedSnapshots) {
        const body = RestrictedReply.parse(
          await getJson(
            app,
            `/calendar/restricted?at=${encodeURIComponent(
              snapshot.event.eventTsUtc,
            )}&instruments=${snapshot.symbol}`,
          ),
        );
        expect(body).toEqual(
          expect.objectContaining({
            restricted: true,
          }),
        );
        expect(body.reasons).toContainEqual({
          event: snapshot.event.title,
          eta_seconds: 0,
          rule: 'blackout_pm5',
        });
      }

      const tierOneSnapshots = expectedEvents.flatMap((event) =>
        event.impact === 'high' || event.restricted
          ? affectedSymbols(event.instrument).map((symbol) => ({ event, symbol }))
          : [],
      );
      expect(tierOneSnapshots.length).toBeGreaterThan(10);
      for (const snapshot of tierOneSnapshots) {
        const atUtc = new Date(
          Date.parse(snapshot.event.eventTsUtc) - 60 * 60 * 1_000,
        ).toISOString();
        const body = RestrictedReply.parse(
          await getJson(
            app,
            `/calendar/pre-news-2h?at=${encodeURIComponent(atUtc)}&instruments=${snapshot.symbol}`,
          ),
        );
        expect(body.restricted).toBe(true);
        expect(body.reasons).toContainEqual({
          event: snapshot.event.title,
          eta_seconds: 3_600,
          rule: 'pre_news_2h',
        });
      }

      const nfp = restrictedSnapshots.find(
        (snapshot) =>
          snapshot.symbol === 'XAUUSD' && snapshot.event.title === 'Non-Farm Employment Change',
      );
      if (!nfp) throw new Error('cassette fixture missing restricted NFP XAUUSD snapshot');
      const nextAtUtc = new Date(Date.parse(nfp.event.eventTsUtc) - 60 * 60 * 1_000).toISOString();
      const next = await getJson(
        app,
        `/calendar/next-restricted?at=${encodeURIComponent(nextAtUtc)}&instruments=XAUUSD`,
      );
      expect(next).toEqual({
        item: calendarItem(nfp.event),
        eta_seconds: 3_600,
      });
    } finally {
      db.close();
    }
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function getJson(app: ReturnType<typeof buildNewsApp>, path: string): Promise<unknown> {
  const res = await app.handle(new Request(`http://news.test${path}`));
  expect(res.status).toBe(200);
  return res.json();
}

function affectedSymbols(instrument: string): string[] {
  const seen = new Set<string>();
  const symbols: string[] = [];
  for (const tag of instrument.split(' + ').map((part) => part.trim())) {
    for (const symbol of TAG_MAP.mappings[tag]?.affects ?? []) {
      if (
        TRACKED_SYMBOLS.includes(symbol as (typeof TRACKED_SYMBOLS)[number]) &&
        !seen.has(symbol)
      ) {
        seen.add(symbol);
        symbols.push(symbol);
      }
    }
  }
  return symbols;
}

function calendarItem(event: ReturnType<typeof mapCalendarItemToEvent>): {
  title: string;
  impact: string;
  instrument: string;
  restriction: boolean;
  eventType: string;
  date: string;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  youtubeLink: string | null;
  articleLink: string | null;
} {
  return {
    title: event.title,
    impact: event.impact,
    instrument: event.instrument,
    restriction: event.restricted,
    eventType: event.eventType,
    date: event.date,
    forecast: event.forecast,
    previous: event.previous,
    actual: event.actual,
    youtubeLink: event.youtubeLink,
    articleLink: event.articleLink,
  };
}
