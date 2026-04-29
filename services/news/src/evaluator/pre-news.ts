import {
  CalendarItem,
  type CalendarItem as CalendarItemType,
  type RestrictedReason,
  RestrictedReply,
  type RestrictedReply as RestrictedReplyType,
} from '@ankit-prop/contracts';
import {
  resolveAffectedSymbols,
  type SymbolTagMap,
  type SymbolTagMapLogger,
} from '../symbol-tag-mapper.ts';

const PRE_NEWS_LOOKAHEAD_MS = 2 * 60 * 60 * 1000;

export interface PreNewsDb {
  queryRange(fromUtc: string, toUtc: string): readonly CalendarItemType[];
}

export interface PreNewsClock {
  nowUtc(): string;
}

export interface EvaluatePreNewsDeps {
  readonly db: PreNewsDb;
  readonly mapper: SymbolTagMap;
  readonly clock?: PreNewsClock;
  readonly logger?: SymbolTagMapLogger;
}

export interface EvaluatePreNewsRequest {
  readonly atUtc?: string;
  readonly instruments: readonly string[];
}

// Window is [atUtc, atUtc + 2h), intentionally exclusive at +2h to avoid double-firing with event-time blackout.
export function evaluatePreNews(
  { db, mapper, clock, logger }: EvaluatePreNewsDeps,
  { atUtc, instruments }: EvaluatePreNewsRequest,
): RestrictedReplyType {
  const activeInstruments = instruments.filter((instrument) => instrument.length > 0);
  if (activeInstruments.length === 0) {
    return restrictedReply([]);
  }

  const atMs = parseInstant(atUtc ?? clock?.nowUtc());
  if (atMs === null) {
    return failClosed('invalid_pre_news_time');
  }

  const toMs = atMs + PRE_NEWS_LOOKAHEAD_MS;
  const events = db.queryRange(new Date(atMs).toISOString(), new Date(toMs).toISOString());
  const reasons: RestrictedReason[] = [];
  for (const rawEvent of events) {
    const parsed = CalendarItem.safeParse(rawEvent);
    if (!parsed.success) {
      return failClosed('malformed_calendar_event');
    }
    const event = parsed.data;
    if (!isTier1Event(event)) continue;
    if (!affectsAnyInstrument(event, activeInstruments, mapper, logger)) continue;

    const eventMs = parseInstant(event.date);
    if (eventMs === null) {
      return failClosed(`malformed_calendar_event_date:${event.title}`);
    }
    if (isInsidePreNewsWindow(eventMs, atMs, toMs)) {
      reasons.push(reasonFor(event, eventMs, atMs));
    }
  }

  return restrictedReply(reasons);
}

function restrictedReply(reasons: RestrictedReason[]): RestrictedReplyType {
  return RestrictedReply.parse({ restricted: reasons.length > 0, reasons });
}

function failClosed(event: string): RestrictedReplyType {
  return RestrictedReply.parse({
    restricted: true,
    reasons: [{ event, eta_seconds: 0, rule: 'stale_calendar' }],
  });
}

function isTier1Event(event: CalendarItemType): boolean {
  return event.impact === 'high' || event.restriction;
}

function parseInstant(value: string | undefined): number | null {
  if (value === undefined) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isInsidePreNewsWindow(eventMs: number, atMs: number, toMs: number): boolean {
  return eventMs >= atMs && eventMs < toMs;
}

function affectsAnyInstrument(
  event: CalendarItemType,
  instruments: readonly string[],
  mapper: SymbolTagMap,
  logger?: SymbolTagMapLogger,
): boolean {
  const affectedSymbols = resolveAffectedSymbols(event.instrument, mapper, logger);
  return instruments.some((instrument) => affectedSymbols.includes(instrument));
}

function reasonFor(event: CalendarItemType, eventMs: number, atMs: number): RestrictedReason {
  return {
    event: event.title,
    eta_seconds: Math.trunc((eventMs - atMs) / 1000),
    rule: 'pre_news_2h',
  };
}
