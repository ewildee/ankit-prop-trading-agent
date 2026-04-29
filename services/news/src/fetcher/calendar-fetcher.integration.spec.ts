import { describe, expect, test } from 'bun:test';

import type { CalendarItem } from '@ankit-prop/contracts';

import { openCalendarDb } from '../db/calendar-db.ts';
import { createCalendarFetcher } from './calendar-fetcher.ts';
import { mapCalendarItemToEvent } from './map-event.ts';

const NOW = '2026-04-29T07:30:00.000Z';
const CLOCK = { now: () => new Date(NOW) };

describe('createCalendarFetcher with CalendarDb', () => {
  test('persists mapped CalendarEvent rows and stays idempotent on refetch', async () => {
    const db = openCalendarDb({ path: ':memory:', clock: CLOCK });
    const item = calendarItem();
    const expected = mapCalendarItemToEvent(item);
    const fetcher = createCalendarFetcher({
      db,
      clock: { nowUtc: () => NOW },
      fetch() {
        return jsonResponse({ items: [item] });
      },
    });

    try {
      const first = await fetcher.fetchOnce();

      expect(first.ok).toBe(true);
      const firstRows = db.selectEventRecordsBetween(expected.eventTsUtc, expected.eventTsUtc);
      expect(firstRows).toHaveLength(1);
      expect(firstRows[0]?.id).toBe(expected.id);
      expect(db.getMeta('last_fetch_ok')).toBe('1');
      expect(db.getMeta('last_fetch_at')).toBe(NOW);

      const second = await fetcher.fetchOnce();

      expect(second.ok).toBe(true);
      const secondRows = db.selectEventRecordsBetween(expected.eventTsUtc, expected.eventTsUtc);
      expect(secondRows).toHaveLength(1);
      expect(secondRows[0]?.id).toBe(expected.id);
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

function calendarItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
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
