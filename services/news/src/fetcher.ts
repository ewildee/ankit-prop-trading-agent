import type { Database } from 'bun:sqlite';
import { type CalendarItem, CalendarResponse } from '@ankit-prop/contracts/news';
import { pragueIsoWithOffset } from '@ankit-prop/eval-harness/prague-day';
import { type UpsertResult, upsertItems } from './calendar-db.ts';

export interface FetcherHealth {
  readonly lastSuccessAt: number | null;
  readonly lastErrorAt: number | null;
  readonly consecutiveFailures: number;
  readonly ageSeconds: number | null;
}

export interface FetcherClock {
  now(): number;
  setInterval(fn: () => void | Promise<void>, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
  sleep(ms: number): Promise<void>;
}

export interface FetcherLogger {
  error(fields: Record<string, unknown>): void;
  warn(fields: Record<string, unknown>): void;
  info?(fields: Record<string, unknown>): void;
}

export interface CreateFetcherOptions {
  readonly db: Database;
  readonly fetch?: typeof fetch;
  readonly clock?: FetcherClock;
  readonly logger: FetcherLogger;
  readonly intervalMs?: number;
  readonly baseUrl?: string;
  readonly dateRangeDays?: number;
}

export interface NewsCalendarFetcher {
  start(): Promise<void>;
  stop(): void;
  getHealth(): FetcherHealth;
}

const DEFAULT_INTERVAL_MS = 30 * 60_000;
const DEFAULT_DATE_RANGE_DAYS = 14;
const DEFAULT_BASE_URL = 'https://gw2.ftmo.com/public-api/v1/economic-calendar';
const DAY_MS = 86_400_000;
const BACKOFF_MS = [1_000, 4_000, 16_000] as const;

const realClock: FetcherClock = {
  now: () => Date.now(),
  setInterval: (fn, intervalMs) => setInterval(fn, intervalMs),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export function createFetcher(opts: CreateFetcherOptions): NewsCalendarFetcher {
  const fetchImpl = opts.fetch ?? fetch;
  const clock = opts.clock ?? realClock;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const dateRangeDays = opts.dateRangeDays ?? DEFAULT_DATE_RANGE_DAYS;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;

  let intervalHandle: unknown = null;
  let inFlight: Promise<void> | null = null;
  let lastSuccessAt: number | null = null;
  let lastErrorAt: number | null = null;
  let consecutiveFailures = 0;
  let unhealthyAlerted = false;

  const recordFailure = (kind: string, detail: Record<string, unknown>): void => {
    lastErrorAt = clock.now();
    consecutiveFailures += 1;
    opts.logger.error({ kind, consecutiveFailures, ...detail });
    if (consecutiveFailures >= 3 && !unhealthyAlerted) {
      unhealthyAlerted = true;
      opts.logger.warn({ kind: 'news_fetch_unhealthy', consecutive: consecutiveFailures });
    }
  };

  const recordSuccess = (result: UpsertResult, itemCount: number): void => {
    lastSuccessAt = clock.now();
    consecutiveFailures = 0;
    unhealthyAlerted = false;
    opts.logger.info?.({
      kind: 'news_fetch_success',
      itemCount,
      inserted: result.inserted,
      updated: result.updated,
    });
  };

  const runOnce = async (): Promise<void> => {
    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImpl(buildCalendarUrl(baseUrl, clock.now(), dateRangeDays));
      } catch (err) {
        recordFailure('news_fetch_network_error', {
          attempt,
          error: errorMessage(err),
        });
        if (await backoff(clock, attempt)) continue;
        return;
      }

      if (response.status >= 500) {
        recordFailure('news_fetch_http_5xx', {
          attempt,
          status: response.status,
        });
        if (await backoff(clock, attempt)) continue;
        return;
      }

      if (!response.ok) {
        recordFailure('news_fetch_http_error', {
          attempt,
          status: response.status,
        });
        return;
      }

      let raw: unknown;
      try {
        raw = await response.json();
      } catch (err) {
        recordFailure('news_fetch_invalid_json', {
          attempt,
          error: errorMessage(err),
        });
        return;
      }

      const parsed = CalendarResponse.safeParse(raw);
      if (!parsed.success) {
        recordFailure('news_fetch_schema_mismatch', {
          attempt,
          issues: parsed.error.issues,
        });
        return;
      }

      logUnknownEventTypes(parsed.data.items, opts.logger);

      try {
        const result = upsertItems(opts.db, parsed.data.items);
        recordSuccess(result, parsed.data.items.length);
      } catch (err) {
        recordFailure('news_fetch_persist_error', {
          attempt,
          error: errorMessage(err),
        });
      }
      return;
    }
  };

  const runScheduled = (): Promise<void> => {
    if (inFlight) {
      return inFlight;
    }
    inFlight = runOnce().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  return {
    async start(): Promise<void> {
      if (intervalHandle !== null) {
        return;
      }
      intervalHandle = clock.setInterval(() => runScheduled(), intervalMs);
      await runScheduled();
    },

    stop(): void {
      if (intervalHandle === null) {
        return;
      }
      clock.clearInterval(intervalHandle);
      intervalHandle = null;
    },

    getHealth(): FetcherHealth {
      return {
        lastSuccessAt,
        lastErrorAt,
        consecutiveFailures,
        ageSeconds:
          lastSuccessAt === null
            ? null
            : Math.max(0, Math.floor((clock.now() - lastSuccessAt) / 1000)),
      };
    },
  };
}

export function buildCalendarUrl(baseUrl: string, fromMs: number, dateRangeDays: number): URL {
  const url = new URL(baseUrl);
  url.searchParams.set('dateFrom', pragueIsoWithOffset(fromMs));
  url.searchParams.set('dateTo', pragueIsoWithOffset(fromMs + dateRangeDays * DAY_MS));
  url.searchParams.set('timezone', 'Europe/Prague');
  return url;
}

async function backoff(clock: FetcherClock, attempt: number): Promise<boolean> {
  const delay = BACKOFF_MS[attempt];
  if (delay === undefined) {
    return false;
  }
  await clock.sleep(delay);
  return true;
}

function logUnknownEventTypes(items: readonly CalendarItem[], logger: FetcherLogger): void {
  const eventTypes = [
    ...new Set(items.map((item) => item.eventType).filter((type) => type !== 'normal')),
  ];
  if (eventTypes.length > 0) {
    logger.warn({ kind: 'news_fetch_unknown_event_type', eventTypes });
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
