import {
  CalendarItem,
  type CalendarItem as CalendarItemType,
  NextRestrictedReply,
  type NextRestrictedReply as NextRestrictedReplyType,
  RestrictedReply,
  type RestrictedReply as RestrictedReplyType,
} from '@ankit-prop/contracts';
import { Elysia } from 'elysia';
import {
  evaluatePreNews,
  evaluateRestricted,
  findNextRestricted,
  MalformedCalendarRowError,
} from '../evaluator/index.ts';
import type { FreshnessMonitor, FreshnessSnapshot } from '../freshness/index.ts';
import {
  resolveAffectedSymbols,
  type SymbolTagMap,
  type SymbolTagMapLogger,
} from '../symbol-tag-mapper.ts';

export interface CalendarRouteClock {
  now(): number;
  nowUtc(): string;
}

export interface CalendarRouteDb {
  selectEventsBetween(
    fromUtc: string,
    toUtc: string,
    options?: { readonly pragueDayBuckets: readonly number[] },
  ): readonly CalendarItemType[];
  selectEventsForPragueDay(day: string): readonly CalendarItemType[];
}

export interface CalendarRouteOptions {
  readonly db: CalendarRouteDb;
  readonly freshness: FreshnessMonitor;
  readonly mapper: SymbolTagMap;
  readonly clock?: CalendarRouteClock;
  readonly logger?: SymbolTagMapLogger;
}

type ElysiaSet = {
  status?: number | string;
};

export function calendarRoutes(options: CalendarRouteOptions) {
  const clock = options.clock ?? defaultClock;

  return new Elysia()
    .get('/calendar/restricted', ({ request, set }) => {
      const query = parseInstrumentQuery(request, set, { at: true });
      if (!query.ok) return query.body;

      return withFreshnessGate(options.freshness, set, () =>
        evaluateRestricted(
          {
            db: options.db,
            mapper: {
              resolveAffectedSymbols: (rawInstrument) =>
                resolveAffectedSymbols(rawInstrument, options.mapper, options.logger),
            },
            clock,
          },
          withOptionalAt(query),
        ),
      );
    })
    .get('/calendar/pre-news-2h', ({ request, set }) => {
      const query = parseInstrumentQuery(request, set, { at: true });
      if (!query.ok) return query.body;

      return withFreshnessGate(options.freshness, set, () => {
        const deps = {
          db: {
            queryRange: (fromUtc: string, toUtc: string) =>
              options.db
                .selectEventsBetween(fromUtc, toUtc)
                .map((event) => CalendarItem.parse(event)),
          },
          mapper: options.mapper,
          clock,
          ...(options.logger ? { logger: options.logger } : {}),
        };
        return evaluatePreNews(deps, withOptionalAt(query));
      });
    })
    .get('/calendar/next-restricted', ({ request, set }) => {
      const query = parseInstrumentQuery(request, set, { at: true });
      if (!query.ok) return query.body;

      return withFreshnessGate(
        options.freshness,
        set,
        () => {
          try {
            return findNextRestricted(
              {
                db: options.db,
                mapper: {
                  resolveAffectedSymbols: (rawInstrument) =>
                    resolveAffectedSymbols(rawInstrument, options.mapper, options.logger),
                },
                clock,
              },
              withOptionalAt(query),
            );
          } catch (error) {
            if (error instanceof MalformedCalendarRowError) {
              set.status = 503;
              return NextRestrictedReply.parse({ item: null, eta_seconds: 0 });
            }
            throw error;
          }
        },
        staleNextRestricted,
      );
    })
    .get('/calendar/window', ({ request, set }) => {
      const query = parseWindowQuery(request, set);
      if (!query.ok) return query.body;

      return withFreshnessGate(options.freshness, set, () => {
        const instruments = new Set(query.instruments);
        return options.db
          .selectEventsBetween(query.fromUtc, query.toUtc)
          .map((event) => CalendarItem.parse(event))
          .filter((event) =>
            resolveAffectedSymbols(event.instrument, options.mapper, options.logger).some(
              (symbol) => instruments.has(symbol),
            ),
          );
      });
    })
    .get('/calendar/by-day', ({ request, set }) => {
      const query = parseByDayQuery(request, set);
      if (!query.ok) return query.body;

      return withFreshnessGate(options.freshness, set, () =>
        options.db.selectEventsForPragueDay(query.day).map((event) => CalendarItem.parse(event)),
      );
    });
}

function withFreshnessGate<T>(
  freshness: FreshnessMonitor,
  set: ElysiaSet,
  handler: () => T,
  staleHandler: (
    snapshot: FreshnessSnapshot,
    set: ElysiaSet,
  ) => T | RestrictedReplyType = staleRestricted,
): T | RestrictedReplyType {
  const snapshot = freshness.currentSnapshot();
  if (!snapshot.fresh) {
    return staleHandler(snapshot, set);
  }
  return handler();
}

function parseInstrumentQuery(
  request: Request,
  set: ElysiaSet,
  opts: { readonly at: true },
): { ok: true; atUtc?: string; instruments: string[] } | { ok: false; body: { error: string } } {
  const url = new URL(request.url);
  if (url.searchParams.has('instrument')) {
    return badRequest(set, 'use repeated instruments query params');
  }

  const parsedAt = parseOptionalUtcInstant(url.searchParams.get('at'), set);
  if (!parsedAt.ok) return parsedAt;

  const instruments = parseInstrumentsParam(url, set);
  if (!instruments.ok) return instruments;

  return parsedAt.atUtc === undefined
    ? { ok: opts.at, instruments: instruments.value }
    : { ok: opts.at, atUtc: parsedAt.atUtc, instruments: instruments.value };
}

function parseWindowQuery(
  request: Request,
  set: ElysiaSet,
):
  | { ok: true; fromUtc: string; toUtc: string; instruments: string[] }
  | { ok: false; body: { error: string } } {
  const url = new URL(request.url);
  const from = parseRequiredUtcInstant(url.searchParams.get('from'), 'from', set);
  if (!from.ok) return from;
  const to = parseRequiredUtcInstant(url.searchParams.get('to'), 'to', set);
  if (!to.ok) return to;
  if (Date.parse(from.value) > Date.parse(to.value)) {
    return badRequest(set, 'from must be <= to');
  }
  const instruments = parseInstrumentsParam(url, set);
  if (!instruments.ok) return instruments;
  return { ok: true, fromUtc: from.value, toUtc: to.value, instruments: instruments.value };
}

function parseByDayQuery(
  request: Request,
  set: ElysiaSet,
): { ok: true; day: string } | { ok: false; body: { error: string } } {
  const day = new URL(request.url).searchParams.get('day');
  if (day === null || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return badRequest(set, 'day must be YYYY-MM-DD');
  }
  const ms = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== day) {
    return badRequest(set, 'day must be a valid YYYY-MM-DD date');
  }
  return { ok: true, day };
}

function parseInstrumentsParam(
  url: URL,
  set: ElysiaSet,
): { ok: true; value: string[] } | { ok: false; body: { error: string } } {
  if (url.searchParams.has('instrument')) {
    return badRequest(set, 'use repeated instruments query params');
  }

  const instruments = url.searchParams.getAll('instruments').map((instrument) => instrument.trim());
  if (instruments.length === 0 || instruments.some((instrument) => instrument.length === 0)) {
    return badRequest(set, 'instruments query params are required');
  }
  if (instruments.some((instrument) => instrument.includes(','))) {
    return badRequest(set, 'instruments must be repeated, not comma-separated');
  }

  return { ok: true, value: instruments };
}

function parseOptionalUtcInstant(
  value: string | null,
  set: ElysiaSet,
): { ok: true; atUtc?: string } | { ok: false; body: { error: string } } {
  if (value === null) return { ok: true };
  const parsed = parseRequiredUtcInstant(value, 'at', set);
  if (!parsed.ok) return parsed;
  return { ok: true, atUtc: parsed.value };
}

function parseRequiredUtcInstant(
  value: string | null,
  name: string,
  set: ElysiaSet,
): { ok: true; value: string } | { ok: false; body: { error: string } } {
  if (value === null || value.trim().length === 0) {
    return badRequest(set, `${name} is required`);
  }
  if (!value.endsWith('Z')) {
    return badRequest(set, `${name} must be a UTC RFC-3339 instant`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    return badRequest(set, `${name} must be a valid UTC RFC-3339 instant`);
  }
  return { ok: true, value: new Date(ms).toISOString() };
}

function badRequest(set: ElysiaSet, error: string): { ok: false; body: { error: string } } {
  set.status = 400;
  return { ok: false, body: { error } };
}

function staleRestricted(snapshot: FreshnessSnapshot): RestrictedReplyType {
  return RestrictedReply.parse({
    restricted: true,
    reasons: [{ event: snapshot.reason, eta_seconds: 0, rule: 'stale_calendar' }],
  });
}

function staleNextRestricted(
  _snapshot: FreshnessSnapshot,
  set: ElysiaSet,
): NextRestrictedReplyType {
  set.status = 503;
  return NextRestrictedReply.parse({ item: null, eta_seconds: 0 });
}

const defaultClock: CalendarRouteClock = {
  now: () => Date.now(),
  nowUtc: () => new Date().toISOString(),
};

function withOptionalAt(query: {
  readonly atUtc?: string;
  readonly instruments: readonly string[];
}) {
  return query.atUtc === undefined
    ? { instruments: query.instruments }
    : { atUtc: query.atUtc, instruments: query.instruments };
}

export type CalendarRoutesApp = ReturnType<typeof calendarRoutes>;
