import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CalendarItem } from '@ankit-prop/contracts';
import {
  CalendarDbOpenError,
  CalendarDbQueryError,
  CalendarDbWriteError,
  calendarItemId,
  closeCalendarDb,
  openCalendarDb,
  queryRange,
  upsertItems,
} from './calendar-db.ts';

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

describe('calendar-db', () => {
  test('openCalendarDb creates the table and indices in WAL mode', async () => {
    await withTempDb((db) => {
      const journalMode = db.query('PRAGMA journal_mode').get() as { journal_mode: string };
      const objects = db
        .query(
          "SELECT name FROM sqlite_master WHERE type IN ('table', 'index') AND name LIKE 'calendar_items%' OR name LIKE 'idx_calendar_items%' ORDER BY name",
        )
        .all() as { name: string }[];

      expect(journalMode.journal_mode.toLowerCase()).toBe('wal');
      expect(objects.map((object) => object.name)).toEqual([
        'calendar_items',
        'idx_calendar_items_instant_ms',
        'idx_calendar_items_instrument_instant',
      ]);
    });
  });

  test('upsertItems round-trips items sorted by date ascending', async () => {
    await withTempDb((db) => {
      const later = item({ title: 'FOMC Statement', date: '2026-04-28T20:00:00+02:00' });
      const earlier = item({ title: 'US CPI', date: '2026-04-28T14:30:00+02:00' });

      expect(upsertItems(db, [later, earlier])).toEqual({ inserted: 2, updated: 0 });
      expect(queryRange(db, '2026-04-28T00:00:00+02:00', '2026-04-29T00:00:00+02:00')).toEqual([
        earlier,
        later,
      ]);
    });
  });

  test('upsertItems is idempotent by sha256(date|title|instrument)', async () => {
    await withTempDb((db) => {
      const id = calendarItemId(BASE_ITEM);

      expect(upsertItems(db, [BASE_ITEM])).toEqual({ inserted: 1, updated: 0 });
      expect(upsertItems(db, [{ ...BASE_ITEM, actual: '206K' }])).toEqual({
        inserted: 0,
        updated: 1,
      });

      const rows = db.query('SELECT id, actual FROM calendar_items').all() as {
        id: string;
        actual: string | null;
      }[];
      expect(rows).toEqual([{ id, actual: '206K' }]);
    });
  });

  test('openCalendarDb raises a structured error for an unwriteable path', () => {
    expect(() => openCalendarDb('/dev/null/x/calendar.db')).toThrow(
      expect.objectContaining({
        name: 'CalendarDbOpenError',
        code: 'unwriteable_path',
        path: '/dev/null/x/calendar.db',
      }),
    );
  });

  test('queryRange uses inclusive from and exclusive to bounds', async () => {
    await withTempDb((db) => {
      const atFrom = item({ title: 'At from', date: '2026-04-28T10:00:00+02:00' });
      const inside = item({ title: 'Inside', date: '2026-04-28T11:00:00+02:00' });
      const atTo = item({ title: 'At to', date: '2026-04-28T12:00:00+02:00' });
      upsertItems(db, [inside, atTo, atFrom]);

      expect(queryRange(db, '2026-04-28T10:00:00+02:00', '2026-04-28T12:00:00+02:00')).toEqual([
        atFrom,
        inside,
      ]);
    });
  });

  test('queryRange optionally filters by the canonical instrument column verbatim', async () => {
    await withTempDb((db) => {
      const xauusd = item({ title: 'Gold event', instrument: 'XAUUSD' });
      const nas100 = item({ title: 'Index event', instrument: 'NAS100' });
      upsertItems(db, [nas100, xauusd]);

      expect(
        queryRange(db, '2026-04-28T00:00:00+02:00', '2026-04-29T00:00:00+02:00', ['XAUUSD']),
      ).toEqual([xauusd]);
    });
  });

  test('queryRange compares equivalent mixed-offset instants by epoch milliseconds', async () => {
    await withTempDb((db) => {
      const event = item({ title: 'ECB Rate Decision', date: '2026-04-28T14:30:00+02:00' });
      upsertItems(db, [event]);

      expect(queryRange(db, '2026-04-28T12:00:00Z', '2026-04-28T13:00:00Z')).toEqual([event]);
      expect(queryRange(db, '2026-04-28T13:00:00Z', '2026-04-28T13:30:00Z')).toEqual([]);
    });
  });

  test('queryRange excludes events exactly at the to bound across equivalent offsets', async () => {
    await withTempDb((db) => {
      const event = item({ title: 'At exact to', date: '2026-04-28T10:00:00+00:00' });
      upsertItems(db, [event]);

      expect(queryRange(db, '2026-04-28T09:00:00Z', '2026-04-28T10:00:00Z')).toEqual([]);
    });
  });

  test('queryRange orders mixed offsets deterministically by instant then title and instrument', async () => {
    await withTempDb((db) => {
      const sameInstantZ = item({
        title: 'Beta same instant',
        instrument: 'NAS100',
        date: '2026-04-28T12:30:00Z',
      });
      const later = item({
        title: 'Later event',
        instrument: 'XAUUSD',
        date: '2026-04-28T12:35:00Z',
      });
      const sameInstantOffset = item({
        title: 'Alpha same instant',
        instrument: 'XAUUSD',
        date: '2026-04-28T14:30:00+02:00',
      });
      upsertItems(db, [later, sameInstantZ, sameInstantOffset]);

      expect(queryRange(db, '2026-04-28T12:00:00Z', '2026-04-28T13:00:00Z')).toEqual([
        sameInstantOffset,
        sameInstantZ,
        later,
      ]);
    });
  });

  test('upsertItems fails closed on invalid item dates', async () => {
    await withTempDb((db) => {
      expect(() => upsertItems(db, [item({ date: 'not-a-date' })])).toThrow(CalendarDbWriteError);
      expect(() => upsertItems(db, [item({ date: 'not-a-date' })])).toThrow(
        expect.objectContaining({
          name: 'CalendarDbWriteError',
          code: 'invalid_instant',
          path: 'date',
          value: 'not-a-date',
        }),
      );
    });
  });

  test('queryRange fails closed on invalid range bounds', async () => {
    await withTempDb((db) => {
      expect(() => queryRange(db, 'garbage', '2026-04-28T00:00:00Z')).toThrow(CalendarDbQueryError);
      expect(() => queryRange(db, 'garbage', '2026-04-28T00:00:00Z')).toThrow(
        expect.objectContaining({
          name: 'CalendarDbQueryError',
          code: 'invalid_range',
          path: 'fromIso',
          value: 'garbage',
        }),
      );
      expect(() => queryRange(db, '2026-04-28T00:00:00Z', 'garbage')).toThrow(CalendarDbQueryError);
      expect(() => queryRange(db, '2026-04-28T00:00:00Z', 'garbage')).toThrow(
        expect.objectContaining({
          name: 'CalendarDbQueryError',
          code: 'invalid_range',
          path: 'toIso',
          value: 'garbage',
        }),
      );
    });
  });

  test('openCalendarDb fails closed on stale calendar_items schemas', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'calendar-db-'));
    const dbPath = join(tmp, 'calendar.db');
    try {
      const db = openCalendarDb(dbPath);
      db.exec('PRAGMA user_version = 1');
      closeCalendarDb(db);

      expect(() => openCalendarDb(dbPath)).toThrow(CalendarDbOpenError);
      expect(() => openCalendarDb(dbPath)).toThrow(
        expect.objectContaining({
          name: 'CalendarDbOpenError',
          code: 'schema_outdated',
          path: dbPath,
        }),
      );
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('closeCalendarDb is idempotent', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'calendar-db-'));
    try {
      const db = openCalendarDb(join(tmp, 'calendar.db'));
      closeCalendarDb(db);
      closeCalendarDb(db);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

async function withTempDb(
  assertions: (db: ReturnType<typeof openCalendarDb>) => void,
): Promise<void> {
  const tmp = await mkdtemp(join(tmpdir(), 'calendar-db-'));
  const db = openCalendarDb(join(tmp, 'calendar.db'));
  try {
    assertions(db);
  } finally {
    closeCalendarDb(db);
    await rm(tmp, { recursive: true, force: true });
  }
}

function item(overrides: Partial<CalendarItem>): CalendarItem {
  return {
    ...BASE_ITEM,
    title: overrides.title ?? BASE_ITEM.title,
    instrument: overrides.instrument ?? BASE_ITEM.instrument,
    date: overrides.date ?? BASE_ITEM.date,
    ...overrides,
  };
}
