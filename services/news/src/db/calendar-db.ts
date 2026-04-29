import { Database } from 'bun:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  CalendarEvent,
  type CalendarEvent as CalendarEventType,
  CalendarItem,
  type CalendarItem as CalendarItemType,
} from '@ankit-prop/contracts';

export interface CalendarDbClock {
  now(): Date;
}

export interface OpenCalendarDbOptions {
  readonly path: string;
  readonly clock: CalendarDbClock;
}

export interface CalendarDb {
  init(): void;
  upsertEvents(events: ReadonlyArray<CalendarEventType>): void;
  selectEventsBetween(
    fromUtc: string,
    toUtc: string,
    options?: CalendarDbRangeOptions,
  ): CalendarItemType[];
  selectEventRecordsBetween(
    fromUtc: string,
    toUtc: string,
    options?: CalendarDbRangeOptions,
  ): CalendarEventType[];
  setMeta(key: string, value: string): void;
  getMeta(key: string): string | null;
  close(): void;
}

export interface CalendarDbRangeOptions {
  readonly pragueDayBuckets?: readonly number[];
}

export class CalendarDbUnwriteableError extends Error {
  readonly path: string;

  constructor(path: string, cause: unknown) {
    super(`calendar-db: cannot open writable SQLite database at ${path}`);
    this.name = 'CalendarDbUnwriteableError';
    this.path = path;
    this.cause = cause;
  }
}

const INIT_SQL_PATH = join(import.meta.dir, 'init.sql');

type CalendarEventRow = {
  id: string;
  event_ts_utc: string;
  currency: string;
  date: string;
  title: string;
  impact: CalendarEventType['impact'];
  instrument: string;
  instrument_tags: string;
  restricted: 0 | 1;
  event_type: string;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  youtube_link: string | null;
  article_link: string | null;
};

export function openCalendarDb(options: OpenCalendarDbOptions): CalendarDb {
  if (options.path !== ':memory:') {
    try {
      mkdirSync(dirname(options.path), { recursive: true });
    } catch (err) {
      throw new CalendarDbUnwriteableError(options.path, err);
    }
  }

  let db: Database;
  try {
    db = new Database(options.path, { create: true });
  } catch (err) {
    throw new CalendarDbUnwriteableError(options.path, err);
  }

  try {
    db.exec('PRAGMA journal_mode=WAL');
    db.exec('PRAGMA synchronous=NORMAL');
  } catch (err) {
    db.close();
    throw new CalendarDbUnwriteableError(options.path, err);
  }

  const calendarDb = new BunSqliteCalendarDb(db, options.clock);
  calendarDb.init();
  return calendarDb;
}

class BunSqliteCalendarDb implements CalendarDb {
  readonly #db: Database;
  readonly #clock: CalendarDbClock;
  readonly #initSql: string;

  constructor(db: Database, clock: CalendarDbClock) {
    this.#db = db;
    this.#clock = clock;
    this.#initSql = readFileSync(INIT_SQL_PATH, 'utf8');
  }

  init(): void {
    this.#db.exec(this.#initSql);
  }

  upsertEvents(events: ReadonlyArray<CalendarEventType>): void {
    const parsed = events.map((event) => CalendarEvent.parse(event));
    const upsertedAtUtc = this.#clock.now().toISOString();
    const upsert = this.#db.prepare(`
      INSERT INTO calendar_event (
        id,
        event_ts_utc,
        currency,
        date,
        title,
        impact,
        instrument,
        instrument_tags,
        restricted,
        event_type,
        forecast,
        previous,
        actual,
        youtube_link,
        article_link,
        upserted_at_utc
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        event_ts_utc = excluded.event_ts_utc,
        currency = excluded.currency,
        date = excluded.date,
        title = excluded.title,
        impact = excluded.impact,
        instrument = excluded.instrument,
        instrument_tags = excluded.instrument_tags,
        restricted = excluded.restricted,
        event_type = excluded.event_type,
        forecast = excluded.forecast,
        previous = excluded.previous,
        actual = excluded.actual,
        youtube_link = excluded.youtube_link,
        article_link = excluded.article_link,
        upserted_at_utc = excluded.upserted_at_utc
    `);

    const tx = this.#db.transaction((batch: ReadonlyArray<CalendarEventType>) => {
      for (const event of batch) {
        upsert.run(
          event.id,
          event.eventTsUtc,
          event.currency,
          event.date,
          event.title,
          event.impact,
          event.instrument,
          JSON.stringify(event.instrumentTags),
          event.restricted ? 1 : 0,
          event.eventType,
          event.forecast,
          event.previous,
          event.actual,
          event.youtubeLink,
          event.articleLink,
          upsertedAtUtc,
        );
      }
    });

    tx(parsed);
  }

  selectEventsBetween(
    fromUtc: string,
    toUtc: string,
    _options?: CalendarDbRangeOptions,
  ): CalendarItemType[] {
    return this.selectEventRecordsBetween(fromUtc, toUtc).map(calendarEventToItem);
  }

  selectEventRecordsBetween(
    fromUtc: string,
    toUtc: string,
    _options?: CalendarDbRangeOptions,
  ): CalendarEventType[] {
    const from = CalendarEvent.shape.eventTsUtc.parse(fromUtc);
    const to = CalendarEvent.shape.eventTsUtc.parse(toUtc);
    const rows = this.#db
      .prepare(
        `
          SELECT
            id,
            event_ts_utc,
            currency,
            date,
            title,
            impact,
            instrument,
            instrument_tags,
            restricted,
            event_type,
            forecast,
            previous,
            actual,
            youtube_link,
            article_link
          FROM calendar_event
          WHERE event_ts_utc >= ? AND event_ts_utc <= ?
          ORDER BY event_ts_utc ASC, id ASC
        `,
      )
      .all(from, to) as CalendarEventRow[];

    return rows.map(rowToCalendarEvent);
  }

  setMeta(key: string, value: string): void {
    this.#db
      .prepare(
        `
          INSERT INTO meta(key, value)
          VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `,
      )
      .run(key, value);
  }

  getMeta(key: string): string | null {
    const row = this.#db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as {
      value: string;
    } | null;
    return row?.value ?? null;
  }

  close(): void {
    this.#db.close();
  }
}

function rowToCalendarEvent(row: CalendarEventRow): CalendarEventType {
  return CalendarEvent.parse({
    id: row.id,
    eventTsUtc: row.event_ts_utc,
    currency: row.currency,
    date: row.date,
    title: row.title,
    impact: row.impact,
    instrument: row.instrument,
    instrumentTags: JSON.parse(row.instrument_tags),
    restricted: row.restricted === 1,
    eventType: row.event_type,
    forecast: row.forecast,
    previous: row.previous,
    actual: row.actual,
    youtubeLink: row.youtube_link,
    articleLink: row.article_link,
  });
}

function calendarEventToItem(event: CalendarEventType): CalendarItemType {
  return CalendarItem.parse({
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
  });
}
