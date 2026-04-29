import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type CalendarEvent, type CalendarItem, CalendarResponse } from '@ankit-prop/contracts';
import { resolveAffectedSymbols, type SymbolTagMap } from '../symbol-tag-mapper.ts';
import { type CalendarDb, CalendarDbUnwriteableError, openCalendarDb } from './calendar-db.ts';

const CASSETTE_PATH = join(
  import.meta.dir,
  '..',
  '..',
  'test',
  'cassettes',
  'ftmo-2026-03-23-week.json',
);

const CLOCK = { now: () => new Date('2026-04-29T07:30:00.000Z') };
const TAG_MAP: SymbolTagMap = {
  mappings: {
    USD: { affects: ['NAS100', 'XAUUSD'] },
    'US Indices': { affects: ['NAS100'] },
    XAUUSD: { affects: ['XAUUSD'] },
    DXY: { affects: [] },
  },
};

describe('calendar-db', () => {
  test('openCalendarDb initializes :memory: with schema metadata', () => {
    withDb(':memory:', (db) => {
      expect(db.getMeta('schema_version')).toBe('1');
      db.init();
      expect(db.getMeta('schema_version')).toBe('1');
    });
  });

  test('init is idempotent when reopening the same database path', async () => {
    const path = await tempDbPath();
    try {
      withDb(path, (db) => {
        db.setMeta('last_fetch_ok', 'true');
        expect(db.getMeta('schema_version')).toBe('1');
      });

      withDb(path, (db) => {
        expect(db.getMeta('schema_version')).toBe('1');
        expect(db.getMeta('last_fetch_ok')).toBe('true');
      });
    } finally {
      await rm(dirnameFromDbPath(path), { recursive: true, force: true });
    }
  });

  test('upsertEvents is idempotent over the FTMO 14-day cassette slice', async () => {
    const events = await cassetteEvents();

    withDb(':memory:', (db) => {
      db.upsertEvents(events);
      db.upsertEvents(events);

      const first = events[0];
      const last = events.at(-1);
      if (!first || !last) {
        throw new Error('cassette fixture unexpectedly empty');
      }
      expect(db.selectEventRecordsBetween(first.eventTsUtc, last.eventTsUtc)).toHaveLength(
        events.length,
      );
    });
  });

  test('upsertEvents rejects payloads that fail CalendarEvent validation', () => {
    withDb(':memory:', (db) => {
      const invalid = {
        ...event({ id: 'bad-event' }),
        eventTsUtc: '2026-04-28T14:30:00+02:00',
      } as unknown as CalendarEvent;

      expect(() => db.upsertEvents([invalid])).toThrow();
      expect(
        db.selectEventsBetween('2026-04-28T00:00:00.000Z', '2026-04-29T00:00:00.000Z'),
      ).toEqual([]);
    });
  });

  test('selectEventsBetween includes boundary events and orders by event_ts_utc ascending', () => {
    const atFrom = event({ id: 'from', eventTsUtc: '2026-04-28T10:00:00.000Z' });
    const inside = event({ id: 'inside', eventTsUtc: '2026-04-28T11:00:00.000Z' });
    const atTo = event({ id: 'to', eventTsUtc: '2026-04-28T12:00:00.000Z' });

    withDb(':memory:', (db) => {
      db.upsertEvents([atTo, inside, atFrom]);

      expect(
        db.selectEventsBetween('2026-04-28T10:00:00.000Z', '2026-04-28T12:00:00.000Z'),
      ).toEqual([calendarItem(atFrom), calendarItem(inside), calendarItem(atTo)]);
    });
  });

  test('multi-tag FTMO instruments round-trip raw instrument and parsed tags for mapping', async () => {
    const event = (await cassetteEvents()).find((candidate) =>
      candidate.instrument.includes(' + '),
    );
    if (!event) {
      throw new Error('cassette fixture unexpectedly has no multi-tag event');
    }

    withDb(':memory:', (db) => {
      db.upsertEvents([event]);

      const records = db.selectEventRecordsBetween(event.eventTsUtc, event.eventTsUtc);
      expect(records).toHaveLength(1);
      expect(records[0]?.instrument).toBe('USD + US Indices + XAUUSD + DXY');
      expect(records[0]?.instrumentTags).toEqual(['USD', 'US Indices', 'XAUUSD', 'DXY']);

      const items = db.selectEventsBetween(event.eventTsUtc, event.eventTsUtc);
      expect(items[0]?.instrument).toBe('USD + US Indices + XAUUSD + DXY');
      expect(resolveAffectedSymbols(items[0]?.instrument ?? '', TAG_MAP)).toEqual([
        'NAS100',
        'XAUUSD',
      ]);
    });
  });

  test('setMeta and getMeta upsert arbitrary freshness keys', () => {
    withDb(':memory:', (db) => {
      expect(db.getMeta('last_fetch_at')).toBeNull();
      db.setMeta('last_fetch_at', '2026-04-29T07:30:00.000Z');
      db.setMeta('last_fetch_ok', 'false');
      db.setMeta('last_fetch_ok', 'true');

      expect(db.getMeta('last_fetch_at')).toBe('2026-04-29T07:30:00.000Z');
      expect(db.getMeta('last_fetch_ok')).toBe('true');
    });
  });

  test('openCalendarDb throws CalendarDbUnwriteableError for an unwriteable path', () => {
    expect(() => openCalendarDb({ path: '/dev/null/calendar.db', clock: CLOCK })).toThrow(
      expect.objectContaining({
        name: 'CalendarDbUnwriteableError',
        path: '/dev/null/calendar.db',
      }),
    );
    expect(() => openCalendarDb({ path: '/dev/null/calendar.db', clock: CLOCK })).toThrow(
      CalendarDbUnwriteableError,
    );
  });
});

async function cassetteEvents(): Promise<CalendarEvent[]> {
  const raw = JSON.parse(await readFile(CASSETTE_PATH, 'utf8'));
  const parsed = CalendarResponse.parse(raw);
  return parsed.items.map(cassetteItemToEvent);
}

function cassetteItemToEvent(item: CalendarItem, index: number): CalendarEvent {
  return event({
    id: `ftmo-cassette-${index}`,
    eventTsUtc: new Date(item.date).toISOString(),
    currency: item.instrument.split(' + ')[0]?.trim() ?? item.instrument,
    date: item.date,
    title: item.title,
    impact: item.impact,
    instrument: item.instrument,
    instrumentTags: splitInstrumentTags(item.instrument),
    restricted: item.restriction,
    eventType: item.eventType,
    forecast: item.forecast,
    previous: item.previous,
    actual: item.actual,
    youtubeLink: item.youtubeLink,
    articleLink: item.articleLink,
  });
}

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'ftmo-event-1',
    eventTsUtc: '2026-04-28T12:30:00.000Z',
    currency: 'USD',
    date: '2026-04-28T14:30:00+02:00',
    title: 'US Non-Farm Payrolls',
    impact: 'high',
    instrument: 'USD + US Indices + XAUUSD + DXY',
    instrumentTags: ['USD', 'US Indices', 'XAUUSD', 'DXY'],
    restricted: true,
    eventType: 'normal',
    forecast: null,
    previous: null,
    actual: null,
    youtubeLink: null,
    articleLink: null,
    ...overrides,
  };
}

function calendarItem(event: CalendarEvent): CalendarItem {
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

function splitInstrumentTags(instrument: string): string[] {
  return instrument
    .split(' + ')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function withDb(path: string, fn: (db: CalendarDb) => void): void {
  const db = openCalendarDb({ path, clock: CLOCK });
  try {
    fn(db);
  } finally {
    db.close();
  }
}

async function tempDbPath(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), 'calendar-db.')), 'calendar.db');
}

function dirnameFromDbPath(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}
