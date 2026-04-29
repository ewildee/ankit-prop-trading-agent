import { type CalendarItem, CalendarResponse } from '@ankit-prop/contracts';

import { calendarFetchBackoffDelayMs } from './backoff.ts';

export type CalendarEvent = CalendarItem;

export type CalendarFetchFailureReason = 'persistent_5xx' | 'http_4xx' | 'schema_mismatch';

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

export const DEFAULT_FTMO_CALENDAR_URL =
  'https://gw2.ftmo.com/public-api/v1/economic-calendar?timezone=Europe%2FPrague';
export const CALENDAR_FETCH_INTERVAL_MS = 30 * 60 * 1_000;

const MAX_HTTP_ATTEMPTS = 3;

const defaultClock: CalendarFetcherClock = {
  nowUtc: () => new Date().toISOString(),
  sleep: (ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)),
};

const silentLogger: CalendarFetcherLogger = {
  warn() {},
};

function calendarUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('timezone', 'Europe/Prague');
  return url.toString();
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

export function createCalendarFetcher(opts: CreateCalendarFetcherOptions): CalendarFetcher {
  const fetchImpl: CalendarFetcherFetch = opts.fetch ?? ((input, init) => Bun.fetch(input, init));
  const clock = opts.clock ?? defaultClock;
  const logger = opts.logger ?? silentLogger;
  const url = calendarUrl(opts.baseUrl ?? DEFAULT_FTMO_CALENDAR_URL);

  let intervalHandle: unknown = null;

  async function fetchOnce(): Promise<CalendarFetchResult> {
    for (let attempt = 1; attempt <= MAX_HTTP_ATTEMPTS; attempt += 1) {
      const response = await fetchImpl(url);

      if (response.status >= 500) {
        if (attempt >= MAX_HTTP_ATTEMPTS) {
          await markFetchFailed(opts.db);
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
        await markFetchFailed(opts.db);
        logger.warn({ event: 'fetcher.http_4xx', status: response.status }, 'fetcher.http_4xx');
        return { ok: false, reason: 'http_4xx' };
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (error) {
        await markFetchFailed(opts.db);
        logger.warn(
          { event: 'fetcher.schema_mismatch', path: '<json>', error: String(error) },
          'fetcher.schema_mismatch',
        );
        return { ok: false, reason: 'schema_mismatch' };
      }

      const parsed = CalendarResponse.safeParse(body);
      if (!parsed.success) {
        await markFetchFailed(opts.db);
        logger.warn(
          { event: 'fetcher.schema_mismatch', path: firstZodErrorPath(parsed.error) },
          'fetcher.schema_mismatch',
        );
        return { ok: false, reason: 'schema_mismatch' };
      }

      const fetchedAt = clock.nowUtc();
      await opts.db.upsertEvents(parsed.data.items, fetchedAt);
      await opts.db.setMeta('last_fetch_at', fetchedAt);
      await opts.db.setMeta('last_fetch_ok', '1');
      return { ok: true, events: parsed.data.items, fetchedAt };
    }

    await markFetchFailed(opts.db);
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
