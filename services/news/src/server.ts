import {
  CalendarItem,
  type CalendarItem as CalendarItemType,
  type RestrictedReason,
  RestrictedReply,
  type RestrictedReply as RestrictedReplyType,
} from '@ankit-prop/contracts/news';
import { z } from 'zod';
import { queryRange as queryCalendarRange } from './calendar-db.ts';
import {
  resolveAffectedSymbols,
  type SymbolTagMap,
  type SymbolTagMapLogger,
} from './symbol-tag-mapper.ts';

const DEFAULT_PORT = 9203;
const STALE_AFTER_SECONDS = 2 * 60 * 60;
const BLACKOUT_WINDOW_MS = 5 * 60 * 1000;
const PRE_NEWS_WINDOW_MS = 2 * 60 * 60 * 1000;
const QUERY_RANGE_END_PADDING_MS = 1;
const EXPLICIT_TIMEZONE_OFFSET_RE = /(?:Z|[+-]\d{2}:?\d{2}(?::\d{2})?)$/;
const DEFAULT_SYMBOL_TAG_MAP: SymbolTagMap = {
  mappings: {
    USD: { affects: ['NAS100', 'XAUUSD'] },
    'US Indices': { affects: ['NAS100'] },
    NAS100: { affects: ['NAS100'] },
    Gold: { affects: ['XAUUSD'] },
    XAUUSD: { affects: ['XAUUSD'] },
    EUR: { affects: [] },
    GBP: { affects: [] },
    CAD: { affects: [] },
    AUD: { affects: [] },
    NZD: { affects: [] },
    CHF: { affects: [] },
    'Crude Oil': { affects: [] },
    DXY: { affects: [] },
  },
};

const CalendarQuery = z.strictObject({
  at: z
    .string()
    .min(1)
    .refine(hasExplicitTimezoneOffset, 'expected explicit Z or numeric offset')
    .refine((value) => !Number.isNaN(Date.parse(value)), 'expected ISO timestamp'),
  instruments: z
    .array(
      z
        .string()
        .min(1)
        .regex(/^[A-Z0-9._-]+$/),
    )
    .min(1),
});

type CalendarDbHandle = Parameters<typeof queryCalendarRange>[0];
type CalendarQueryFn = typeof queryCalendarRange;

export interface FetcherHealth {
  readonly lastFetchAt: string | null;
  readonly ageSeconds: number | null;
  readonly dbOk: boolean;
}

export interface NewsLogger {
  error?(payload: Record<string, unknown>, message?: string): void;
  warn?(payload: Record<string, unknown>, message?: string): void;
}

export interface CreateServerOptions {
  readonly db: CalendarDbHandle;
  readonly fetcherHealth: FetcherHealth | (() => FetcherHealth);
  readonly port?: number;
  readonly logger?: NewsLogger;
  readonly queryRange?: CalendarQueryFn;
  readonly symbolTagMap?: SymbolTagMap;
  readonly version?: string;
}

export interface NewsServer {
  readonly port: number;
  fetch(req: Request): Promise<Response>;
}

export function createServer(opts: CreateServerOptions): NewsServer {
  const port = opts.port ?? DEFAULT_PORT;
  const queryRange = opts.queryRange ?? queryCalendarRange;
  const symbolTagMap = opts.symbolTagMap ?? DEFAULT_SYMBOL_TAG_MAP;
  const version = opts.version ?? '0.3.0';

  return {
    port,
    async fetch(req): Promise<Response> {
      const url = new URL(req.url);

      if (req.method !== 'GET') {
        return json({ ok: false, error: { code: 'method_not_allowed' } }, 405);
      }

      if (url.pathname === '/health/details') {
        const health = getHealth(opts.fetcherHealth);
        return json({
          ok: isCalendarFresh(health),
          lastFetchAt: health.lastFetchAt,
          ageSeconds: health.ageSeconds,
          dbOk: health.dbOk,
          version,
        });
      }

      if (url.pathname === '/calendar/restricted') {
        const query = parseCalendarQuery(url);
        if (!query.success) return invalidQuery(query.error);

        const health = getHealth(opts.fetcherHealth);
        if (!isCalendarFresh(health)) return json(staleRestrictedReply());

        const atMs = Date.parse(query.data.at);
        const events = queryEvents(opts.db, queryRange, atMs, opts.logger);
        if (!events.ok) return json(staleRestrictedReply());
        const reasons = events.items
          .filter(
            (event) =>
              event.restriction &&
              affectsAnyInstrument(event, query.data.instruments, symbolTagMap, opts.logger),
          )
          .filter((event) => Math.abs(Date.parse(event.date) - atMs) <= BLACKOUT_WINDOW_MS)
          .map((event) => reasonFor(event, atMs, 'blackout_pm5'));

        return json(restrictedReply(reasons));
      }

      if (url.pathname === '/calendar/pre-news-2h') {
        const query = parseCalendarQuery(url);
        if (!query.success) return invalidQuery(query.error);

        const health = getHealth(opts.fetcherHealth);
        if (!isCalendarFresh(health)) return json(staleRestrictedReply());

        const atMs = Date.parse(query.data.at);
        const events = queryEvents(opts.db, queryRange, atMs, opts.logger);
        if (!events.ok) return json(staleRestrictedReply());
        const reasons = events.items
          .filter(isTier1Event)
          .filter((event) =>
            affectsAnyInstrument(event, query.data.instruments, symbolTagMap, opts.logger),
          )
          .filter((event) => {
            const eventMs = Date.parse(event.date);
            return atMs >= eventMs - PRE_NEWS_WINDOW_MS && atMs <= eventMs;
          })
          .map((event) => reasonFor(event, atMs, 'pre_news_2h'));

        return json(restrictedReply(reasons));
      }

      return json({ ok: false, error: { code: 'not_found' } }, 404);
    },
  };
}

export function startServer(opts: CreateServerOptions): ReturnType<typeof Bun.serve> {
  const server = createServer(opts);
  return Bun.serve({ port: server.port, fetch: server.fetch });
}

function parseCalendarQuery(url: URL): ReturnType<typeof CalendarQuery.safeParse> {
  return CalendarQuery.safeParse({
    at: url.searchParams.get('at'),
    instruments: url.searchParams.getAll('instruments[]'),
  });
}

function invalidQuery(error: z.ZodError): Response {
  return json(
    {
      ok: false,
      error: {
        code: 'invalid_query',
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    },
    400,
  );
}

function getHealth(health: FetcherHealth | (() => FetcherHealth)): FetcherHealth {
  return typeof health === 'function' ? health() : health;
}

function isCalendarFresh(health: FetcherHealth): boolean {
  return health.dbOk && health.ageSeconds !== null && health.ageSeconds <= STALE_AFTER_SECONDS;
}

function queryEvents(
  db: CalendarDbHandle,
  queryRange: CalendarQueryFn,
  atMs: number,
  logger?: NewsLogger,
): { readonly ok: true; readonly items: CalendarItemType[] } | { readonly ok: false } {
  const fromIso = new Date(atMs - BLACKOUT_WINDOW_MS).toISOString();
  const toIso = new Date(atMs + PRE_NEWS_WINDOW_MS + QUERY_RANGE_END_PADDING_MS).toISOString();

  try {
    return {
      ok: true,
      items: queryRange(db, fromIso, toIso).map((item) => CalendarItem.parse(item)),
    };
  } catch (err) {
    logger?.error?.({ err }, 'calendar query failed; fail closed');
    return { ok: false };
  }
}

function restrictedReply(reasons: RestrictedReason[]): RestrictedReplyType {
  return RestrictedReply.parse({ restricted: reasons.length > 0, reasons });
}

function staleRestrictedReply(): RestrictedReplyType {
  return RestrictedReply.parse({
    restricted: true,
    reasons: [{ event: 'stale_calendar', eta_seconds: 0, rule: 'stale_calendar' }],
  });
}

function reasonFor(
  event: CalendarItemType,
  atMs: number,
  rule: RestrictedReason['rule'],
): RestrictedReason {
  return {
    event: event.title,
    eta_seconds: Math.trunc((Date.parse(event.date) - atMs) / 1000),
    rule,
  };
}

function isTier1Event(event: CalendarItemType): boolean {
  return event.impact === 'high' || event.restriction;
}

function affectsAnyInstrument(
  event: CalendarItemType,
  instruments: readonly string[],
  symbolTagMap: SymbolTagMap,
  logger?: NewsLogger,
): boolean {
  if (event.instrument === 'ALL') return true;
  const affectedSymbols = resolveAffectedSymbols(
    event.instrument,
    symbolTagMap,
    symbolTagMapLogger(logger),
  );
  return instruments.some((instrument) => affectedSymbols.includes(instrument));
}

function symbolTagMapLogger(logger?: NewsLogger): SymbolTagMapLogger | undefined {
  if (!logger?.warn) return undefined;
  return {
    warn: (message, context) => logger.warn?.(context ?? {}, message),
  };
}

function hasExplicitTimezoneOffset(value: string): boolean {
  return EXPLICIT_TIMEZONE_OFFSET_RE.test(value.trim());
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
