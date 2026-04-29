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

  const atMs = Date.parse(atUtc ?? clock?.nowUtc() ?? '');
  const toMs = atMs + PRE_NEWS_LOOKAHEAD_MS;
  const events = db.queryRange(new Date(atMs).toISOString(), new Date(toMs).toISOString());
  const reasons = events
    .map((event) => CalendarItem.parse(event))
    .filter(isTier1Event)
    .filter((event) => isInsidePreNewsWindow(event, atMs, toMs))
    .filter((event) => affectsAnyInstrument(event, activeInstruments, mapper, logger))
    .map((event) => reasonFor(event, atMs));

  return restrictedReply(reasons);
}

function restrictedReply(reasons: RestrictedReason[]): RestrictedReplyType {
  return RestrictedReply.parse({ restricted: reasons.length > 0, reasons });
}

function isTier1Event(event: CalendarItemType): boolean {
  return event.impact === 'high' || event.restriction;
}

function isInsidePreNewsWindow(event: CalendarItemType, atMs: number, toMs: number): boolean {
  const eventMs = Date.parse(event.date);
  return eventMs >= atMs && eventMs < toMs;
}

function affectsAnyInstrument(
  event: CalendarItemType,
  instruments: readonly string[],
  mapper: SymbolTagMap,
  logger?: SymbolTagMapLogger,
): boolean {
  if (event.instrument === 'ALL') return true;
  const affectedSymbols = resolveAffectedSymbols(event.instrument, mapper, logger);
  return instruments.some((instrument) => affectedSymbols.includes(instrument));
}

function reasonFor(event: CalendarItemType, atMs: number): RestrictedReason {
  return {
    event: event.title,
    eta_seconds: Math.trunc((Date.parse(event.date) - atMs) / 1000),
    rule: 'pre_news_2h',
  };
}
