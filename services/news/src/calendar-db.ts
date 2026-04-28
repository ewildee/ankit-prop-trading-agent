import { Database } from 'bun:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CalendarItem, type CalendarItem as CalendarItemType } from '@ankit-prop/contracts';

export type CalendarDbOpenErrorCode = 'unwriteable_path' | 'init_failed' | 'schema_outdated';

export class CalendarDbOpenError extends Error {
  readonly code: CalendarDbOpenErrorCode;
  readonly path: string;

  constructor(params: {
    readonly code: CalendarDbOpenErrorCode;
    readonly path: string;
    readonly message: string;
    readonly cause?: unknown;
  }) {
    super(params.message);
    this.name = 'CalendarDbOpenError';
    this.code = params.code;
    this.path = params.path;
    this.cause = params.cause;
  }
}

export type CalendarDbWriteErrorCode = 'invalid_instant';

export class CalendarDbWriteError extends Error {
  readonly code: CalendarDbWriteErrorCode;
  readonly path: string;
  readonly value: string;

  constructor(params: {
    readonly code: CalendarDbWriteErrorCode;
    readonly path: string;
    readonly value: string;
    readonly message: string;
  }) {
    super(params.message);
    this.name = 'CalendarDbWriteError';
    this.code = params.code;
    this.path = params.path;
    this.value = params.value;
  }
}

export type CalendarDbQueryErrorCode = 'invalid_range';

export class CalendarDbQueryError extends Error {
  readonly code: CalendarDbQueryErrorCode;
  readonly path: string;
  readonly value: string;

  constructor(params: {
    readonly code: CalendarDbQueryErrorCode;
    readonly path: string;
    readonly value: string;
    readonly message: string;
  }) {
    super(params.message);
    this.name = 'CalendarDbQueryError';
    this.code = params.code;
    this.path = params.path;
    this.value = params.value;
  }
}

export interface UpsertResult {
  readonly inserted: number;
  readonly updated: number;
}

const INIT_SQL_PATH = join(import.meta.dir, '..', 'sql', 'init.sql');
const CLOSED_DATABASES = new WeakSet<Database>();

export function openCalendarDb(path: string): Database {
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch (err) {
    throw new CalendarDbOpenError({
      code: 'unwriteable_path',
      path,
      message: `calendar-db: cannot prepare database directory for ${path}: ${(err as Error).message}`,
      cause: err,
    });
  }

  let db: Database;
  try {
    db = new Database(path, { create: true });
  } catch (err) {
    throw new CalendarDbOpenError({
      code: 'unwriteable_path',
      path,
      message: `calendar-db: cannot open database at ${path}: ${(err as Error).message}`,
      cause: err,
    });
  }

  try {
    db.exec('PRAGMA journal_mode=WAL');
    assertSchemaCanInitialize(db, path);
    db.exec(readFileSync(INIT_SQL_PATH, 'utf8'));
    return db;
  } catch (err) {
    closeCalendarDb(db);
    if (err instanceof CalendarDbOpenError) {
      throw err;
    }
    throw new CalendarDbOpenError({
      code: 'init_failed',
      path,
      message: `calendar-db: cannot initialise database at ${path}: ${(err as Error).message}`,
      cause: err,
    });
  }
}

export function upsertItems(db: Database, items: ReadonlyArray<CalendarItemType>): UpsertResult {
  const existsStmt = db.prepare('SELECT 1 FROM calendar_items WHERE id = ? LIMIT 1');
  const upsertStmt = db.prepare(`
    INSERT INTO calendar_items (
      id,
      fetched_at,
      date,
      instant_ms,
      title,
      impact,
      instrument,
      restriction,
      event_type,
      forecast,
      previous,
      actual,
      youtube_link,
      article_link
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      fetched_at = excluded.fetched_at,
      date = excluded.date,
      instant_ms = excluded.instant_ms,
      title = excluded.title,
      impact = excluded.impact,
      instrument = excluded.instrument,
      restriction = excluded.restriction,
      event_type = excluded.event_type,
      forecast = excluded.forecast,
      previous = excluded.previous,
      actual = excluded.actual,
      youtube_link = excluded.youtube_link,
      article_link = excluded.article_link
  `);
  const fetchedAt = new Date().toISOString();
  const result: UpsertResult = { inserted: 0, updated: 0 };

  const tx = db.transaction((batch: ReadonlyArray<CalendarItemType>) => {
    let inserted = 0;
    let updated = 0;

    for (const item of batch) {
      const parsed = CalendarItem.parse(item);
      const instantMs = parseItemInstant(parsed.date);
      const id = calendarItemId(parsed);
      const existed = existsStmt.get(id) !== null;
      upsertStmt.run(
        id,
        fetchedAt,
        parsed.date,
        instantMs,
        parsed.title,
        parsed.impact,
        parsed.instrument,
        parsed.restriction ? 1 : 0,
        parsed.eventType,
        parsed.forecast,
        parsed.previous,
        parsed.actual,
        parsed.youtubeLink,
        parsed.articleLink,
      );

      if (existed) {
        updated += 1;
      } else {
        inserted += 1;
      }
    }

    return { inserted, updated };
  });

  return tx(items) ?? result;
}

export function queryRange(
  db: Database,
  fromIso: string,
  toIso: string,
  instruments?: readonly string[],
): CalendarItemType[] {
  const fromMs = parseRangeInstant('fromIso', fromIso);
  const toMs = parseRangeInstant('toIso', toIso);
  const activeInstruments = instruments?.filter((instrument) => instrument.length > 0) ?? [];
  const params: (string | number)[] = [fromMs, toMs];
  let instrumentClause = '';

  if (activeInstruments.length > 0) {
    instrumentClause = ` AND instrument IN (${activeInstruments.map(() => '?').join(', ')})`;
    params.push(...activeInstruments);
  }

  const rows = db
    .prepare(
      `
        SELECT
          date,
          title,
          impact,
          instrument,
          restriction,
          event_type,
          forecast,
          previous,
          actual,
          youtube_link,
          article_link
        FROM calendar_items
        WHERE instant_ms >= ? AND instant_ms < ?${instrumentClause}
        ORDER BY instant_ms ASC, title ASC, instrument ASC
      `,
    )
    .all(...params) as CalendarItemRow[];

  return rows.map(rowToCalendarItem);
}

function assertSchemaCanInitialize(db: Database, path: string): void {
  const version = (db.query('PRAGMA user_version').get() as { user_version: number }).user_version;
  const hasCalendarItems =
    db
      .query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'calendar_items' LIMIT 1")
      .get() !== null;
  const isFreshDb = version === 0 && !hasCalendarItems;

  if (!isFreshDb && version < 2) {
    throw new CalendarDbOpenError({
      code: 'schema_outdated',
      path,
      message: `calendar-db: schema at ${path} is outdated (user_version ${version}); delete the stale DB so it can be recreated`,
    });
  }
}

function parseItemInstant(value: string): number {
  const instantMs = Date.parse(value);
  if (Number.isNaN(instantMs)) {
    throw new CalendarDbWriteError({
      code: 'invalid_instant',
      path: 'date',
      value,
      message: `calendar-db: invalid calendar item date: ${value}`,
    });
  }
  return instantMs;
}

function parseRangeInstant(path: 'fromIso' | 'toIso', value: string): number {
  const instantMs = Date.parse(value);
  if (Number.isNaN(instantMs)) {
    throw new CalendarDbQueryError({
      code: 'invalid_range',
      path,
      value,
      message: `calendar-db: invalid range bound ${path}: ${value}`,
    });
  }
  return instantMs;
}

export function closeCalendarDb(db: Database): void {
  if (CLOSED_DATABASES.has(db)) {
    return;
  }

  db.close();
  CLOSED_DATABASES.add(db);
}

export function calendarItemId(item: CalendarItemType): string {
  return new Bun.CryptoHasher('sha256')
    .update(`${item.date}|${item.title}|${item.instrument}`)
    .digest('hex');
}

type CalendarItemRow = {
  date: string;
  title: string;
  impact: CalendarItemType['impact'];
  instrument: string;
  restriction: number;
  event_type: string;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  youtube_link: string | null;
  article_link: string | null;
};

function rowToCalendarItem(row: CalendarItemRow): CalendarItemType {
  return CalendarItem.parse({
    title: row.title,
    impact: row.impact,
    instrument: row.instrument,
    restriction: row.restriction === 1,
    eventType: row.event_type,
    date: row.date,
    forecast: row.forecast,
    previous: row.previous,
    actual: row.actual,
    youtubeLink: row.youtube_link,
    articleLink: row.article_link,
  });
}
