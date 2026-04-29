import { describe, expect, test } from 'bun:test';

import { type CalendarItem, RestrictedReply } from '@ankit-prop/contracts';

import { buildNewsApp } from '../../src/app.ts';
import { openCalendarDb } from '../../src/db/calendar-db.ts';
import { mapCalendarItemToEvent } from '../../src/fetcher/index.ts';
import type { FreshnessMonitor } from '../../src/freshness/index.ts';
import type { SymbolTagMap } from '../../src/symbol-tag-mapper.ts';

const STARTED_AT_MS = Date.parse('2026-03-29T00:00:00.000Z');
const MAP: SymbolTagMap = {
  mappings: {
    XAUUSD: { affects: ['XAUUSD'] },
  },
};
const FRESHNESS: FreshnessMonitor = {
  currentSnapshot: () => ({
    ageSeconds: 60,
    fresh: true,
    lastFetchAtUtc: '2026-03-29T00:00:00.000Z',
    reason: 'fresh',
  }),
};

describe('news app Prague DST integration', () => {
  test('honors the FTMO offset through the spring-forward gap deterministically', async () => {
    const springGap = item({
      title: 'Synthetic Prague spring-forward gap',
      date: '2026-03-29T02:30:00+01:00',
    });
    const db = openCalendarDb({ path: ':memory:', clock: { now: () => new Date(STARTED_AT_MS) } });
    try {
      db.upsertEvents([mapCalendarItemToEvent(springGap)]);
      const app = makeApp(db);

      const restricted = await app.handle(
        new Request(
          'http://news.test/calendar/restricted?at=2026-03-29T01:30:00.000Z&instruments=XAUUSD',
        ),
      );
      const preNews = await app.handle(
        new Request(
          'http://news.test/calendar/pre-news-2h?at=2026-03-29T00:30:00.000Z&instruments=XAUUSD',
        ),
      );
      const byDay = await app.handle(
        new Request('http://news.test/calendar/by-day?day=2026-03-29'),
      );

      expect(restricted.status).toBe(200);
      expect(RestrictedReply.parse(await restricted.json())).toEqual({
        restricted: true,
        reasons: [
          {
            event: springGap.title,
            eta_seconds: 0,
            rule: 'blackout_pm5',
          },
        ],
      });
      expect(preNews.status).toBe(200);
      expect(RestrictedReply.parse(await preNews.json())).toEqual({
        restricted: true,
        reasons: [
          {
            event: springGap.title,
            eta_seconds: 3_600,
            rule: 'pre_news_2h',
          },
        ],
      });
      expect(byDay.status).toBe(200);
      expect(await byDay.json()).toEqual([springGap]);
    } finally {
      db.close();
    }
  });

  test('keeps the two fall-back 02:30 Prague events distinct by offset', async () => {
    const firstHour = item({
      title: 'Synthetic Prague fall-back first 02:30',
      date: '2026-10-25T02:30:00+02:00',
    });
    const secondHour = item({
      title: 'Synthetic Prague fall-back second 02:30',
      date: '2026-10-25T02:30:00+01:00',
    });
    const db = openCalendarDb({ path: ':memory:', clock: { now: () => new Date(STARTED_AT_MS) } });
    try {
      db.upsertEvents([mapCalendarItemToEvent(secondHour), mapCalendarItemToEvent(firstHour)]);
      const app = makeApp(db);

      const window = await app.handle(
        new Request(
          'http://news.test/calendar/window?from=2026-10-25T00:00:00.000Z&to=2026-10-25T02:00:00.000Z&instruments=XAUUSD',
        ),
      );
      const firstRestricted = await app.handle(
        new Request(
          'http://news.test/calendar/restricted?at=2026-10-25T00:30:00.000Z&instruments=XAUUSD',
        ),
      );
      const secondRestricted = await app.handle(
        new Request(
          'http://news.test/calendar/restricted?at=2026-10-25T01:30:00.000Z&instruments=XAUUSD',
        ),
      );

      expect(window.status).toBe(200);
      expect(await window.json()).toEqual([firstHour, secondHour]);
      expect(firstRestricted.status).toBe(200);
      expect(RestrictedReply.parse(await firstRestricted.json()).reasons).toContainEqual({
        event: firstHour.title,
        eta_seconds: 0,
        rule: 'blackout_pm5',
      });
      expect(secondRestricted.status).toBe(200);
      expect(RestrictedReply.parse(await secondRestricted.json()).reasons).toContainEqual({
        event: secondHour.title,
        eta_seconds: 0,
        rule: 'blackout_pm5',
      });
    } finally {
      db.close();
    }
  });
});

function makeApp(db: Parameters<typeof buildNewsApp>[0]['db']) {
  return buildNewsApp({
    db,
    freshness: FRESHNESS,
    mapper: MAP,
    version: '0.0.0-test',
    startedAtMs: STARTED_AT_MS,
    clock: {
      now: () => STARTED_AT_MS,
      nowUtc: () => new Date(STARTED_AT_MS).toISOString(),
    },
  });
}

function item(overrides: Partial<CalendarItem>): CalendarItem {
  return {
    title: 'Synthetic Prague DST event',
    impact: 'high',
    instrument: 'XAUUSD',
    restriction: true,
    eventType: 'normal',
    date: '2026-03-29T02:30:00+01:00',
    forecast: null,
    previous: null,
    actual: null,
    youtubeLink: null,
    articleLink: null,
    ...overrides,
  };
}
