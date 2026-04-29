import { type CalendarItem, CalendarResponse } from '@ankit-prop/contracts';

import { calendarFetchBackoffDelayMs } from './backoff.ts';

export type CalendarEvent = CalendarItem;

export type CalendarFetchFailureReason =
  | 'persistent_5xx'
  | 'http_4xx'
  | 'empty_window'
  | 'schema_mismatch'
  | 'fetch_error'
  | 'persist_error';

export type CalendarFetchResult =
  | { ok: true; events: CalendarEvent[]; fetchedAt: string }
  | { ok: false; reason: CalendarFetchFailureReason };

export interface CalendarFetcherDb {
  upsertEvents(events: readonly CalendarEvent[], fetchedAt: string): void | Promise<void>;
  setMeta(key: 'last_fetch_at' | 'last_fetch_ok', value: string): void | Promise<void>;
}

export interface CalendarFetcherClock {
  nowUtc(): string;
  sleep?(ms: number): void | Promise<void>;
  setInterval?(callback: () => void, ms: number): unknown;
  clearInterval?(handle: unknown): void;
}

export interface CalendarFetcherLogger {
  warn(payload: Record<string, unknown>, message?: string): void;
  error?(payload: Record<string, unknown>, message?: string): void;
}

export type CalendarFetcherFetch = (
  input: string | URL,
  init?: RequestInit,
) => Response | Promise<Response>;

export interface CreateCalendarFetcherOptions {
  readonly db: CalendarFetcherDb;
  readonly fetch?: CalendarFetcherFetch;
  readonly clock?: CalendarFetcherClock;
  readonly logger?: CalendarFetcherLogger;
  readonly baseUrl?: string;
}

export interface CalendarFetcher {
  fetchOnce(): Promise<CalendarFetchResult>;
  start(): void;
  stop(): void;
}

export const DEFAULT_FTMO_CALENDAR_URL = 'https://gw2.ftmo.com/public-api/v1/economic-calendar';
export const CALENDAR_FETCH_INTERVAL_MS = 30 * 60 * 1_000;

const MAX_HTTP_ATTEMPTS = 3;
const CALENDAR_WINDOW_MS = 14 * 24 * 60 * 60 * 1_000;
const PRAGUE_TZ = 'Europe/Prague';

const PRAGUE_DATE_TIME = new Intl.DateTimeFormat('en-CA', {
  timeZone: PRAGUE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
});

const defaultClock: CalendarFetcherClock = {
  nowUtc: () => new Date().toISOString(),
  sleep: (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)),
};

const silentLogger: CalendarFetcherLogger = {
  warn() {},
};

interface CalendarFetchWindow {
  readonly url: string;
  readonly dateFrom: string;
  readonly dateTo: string;
}

function formatPragueDateTime(tsMs: number): string {
  const parts = PRAGUE_DATE_TIME.formatToParts(new Date(tsMs));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  const offset = get('timeZoneName').replace('GMT', '') || '+00:00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get(
    'second',
  )}${offset}`;
}

function calendarUrl(baseUrl: string, nowUtc: string): CalendarFetchWindow {
  const nowMs = Date.parse(nowUtc);
  if (!Number.isFinite(nowMs)) {
    throw new Error(`invalid nowUtc: ${nowUtc}`);
  }
  const dateFrom = formatPragueDateTime(nowMs);
  const dateTo = formatPragueDateTime(nowMs + CALENDAR_WINDOW_MS);
  const url = new URL(baseUrl);
  url.searchParams.set('dateFrom', dateFrom);
  url.searchParams.set('dateTo', dateTo);
  url.searchParams.set('timezone', PRAGUE_TZ);
  return { url: url.toString(), dateFrom, dateTo };
}

function firstZodErrorPath(error: { issues: readonly { path: readonly PropertyKey[] }[] }): string {
  const first = error.issues[0];
  if (!first || first.path.length === 0) {
    return '<root>';
  }
  return first.path.map((part) => String(part)).join('.');
}

async function markFetchFailed(db: CalendarFetcherDb): Promise<void> {
  await db.setMeta('last_fetch_ok', '0');
}

async function markFetchFailedBestEffort(
  db: CalendarFetcherDb,
  logger: CalendarFetcherLogger,
): Promise<void> {
  try {
    await markFetchFailed(db);
  } catch (error) {
    logger.error?.({ event: 'fetcher.mark_failed_error', error }, 'fetcher.mark_failed_error');
  }
}

export function createCalendarFetcher(opts: CreateCalendarFetcherOptions): CalendarFetcher {
  const fetchImpl: CalendarFetcherFetch = opts.fetch ?? ((input, init) => Bun.fetch(input, init));
  const clock = opts.clock ?? defaultClock;
  const logger = opts.logger ?? silentLogger;
  const baseUrl = opts.baseUrl ?? DEFAULT_FTMO_CALENDAR_URL;

  let intervalHandle: unknown = null;

  async function fetchOnce(): Promise<CalendarFetchResult> {
    let url: string;
    let dateFrom: string;
    let dateTo: string;
    try {
      const window = calendarUrl(baseUrl, clock.nowUtc());
      url = window.url;
      dateFrom = window.dateFrom;
      dateTo = window.dateTo;
    } catch (error) {
      await markFetchFailedBestEffort(opts.db, logger);
      logger.warn({ event: 'fetcher.fetch_error', error }, 'fetcher.fetch_error');
      return { ok: false, reason: 'fetch_error' };
    }

    for (let attempt = 1; attempt <= MAX_HTTP_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImpl(url);
      } catch (error) {
        await markFetchFailedBestEffort(opts.db, logger);
        logger.warn({ event: 'fetcher.fetch_error', error }, 'fetcher.fetch_error');
        return { ok: false, reason: 'fetch_error' };
      }

      if (response.status >= 500) {
        if (attempt >= MAX_HTTP_ATTEMPTS) {
          await markFetchFailedBestEffort(opts.db, logger);
          logger.warn(
            { event: 'fetcher.persistent_5xx', status: response.status, attempts: attempt },
            'fetcher.persistent_5xx',
          );
          return { ok: false, reason: 'persistent_5xx' };
        }

        const delayMs = calendarFetchBackoffDelayMs(attempt);
        if (delayMs !== null) {
          await clock.sleep?.(delayMs);
        }
        continue;
      }

      if (response.status >= 400) {
        await markFetchFailedBestEffort(opts.db, logger);
        logger.warn({ event: 'fetcher.http_4xx', status: response.status }, 'fetcher.http_4xx');
        return { ok: false, reason: 'http_4xx' };
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        await markFetchFailedBestEffort(opts.db, logger);
        logger.warn(
          { event: 'fetcher.schema_mismatch', path: '<json>', error: String(error) },
          'fetcher.schema_mismatch',
        );
        return { ok: false, reason: 'schema_mismatch' };
      }

      const parsed = CalendarResponse.safeParse(body);
      if (!parsed.success) {
        await markFetchFailedBestEffort(opts.db, logger);
        logger.warn(
          { event: 'fetcher.schema_mismatch', path: firstZodErrorPath(parsed.error) },
          'fetcher.schema_mismatch',
        );
        return { ok: false, reason: 'schema_mismatch' };
      }

      if (parsed.data.items.length === 0) {
        await markFetchFailedBestEffort(opts.db, logger);
        logger.warn({ event: 'fetcher.empty_window', dateFrom, dateTo }, 'fetcher.empty_window');
        return { ok: false, reason: 'empty_window' };
      }

      const fetchedAt = clock.nowUtc();
      try {
        await opts.db.upsertEvents(parsed.data.items, fetchedAt);
        await opts.db.setMeta('last_fetch_at', fetchedAt);
        await opts.db.setMeta('last_fetch_ok', '1');
      } catch (error) {
        await markFetchFailedBestEffort(opts.db, logger);
        logger.warn({ event: 'fetcher.persist_error', error }, 'fetcher.persist_error');
        return { ok: false, reason: 'persist_error' };
      }
      return { ok: true, events: parsed.data.items, fetchedAt };
    }

    await markFetchFailedBestEffort(opts.db, logger);
    return { ok: false, reason: 'persistent_5xx' };
  }

  function runFetch(): void {
    void fetchOnce().catch((error: unknown) => {
      logger.error?.({ event: 'fetcher.unhandled_error', error }, 'fetcher.unhandled_error');
    });
  }

  return {
    fetchOnce,
    start() {
      if (intervalHandle !== null) {
        return;
      }
      runFetch();
      intervalHandle = clock.setInterval
        ? clock.setInterval(runFetch, CALENDAR_FETCH_INTERVAL_MS)
        : globalThis.setInterval(runFetch, CALENDAR_FETCH_INTERVAL_MS);
    },
    stop() {
      if (intervalHandle === null) {
        return;
      }
      if (clock.clearInterval) {
        clock.clearInterval(intervalHandle);
      } else {
        globalThis.clearInterval(intervalHandle as ReturnType<typeof globalThis.setInterval>);
      }
      intervalHandle = null;
    },
  };
}
