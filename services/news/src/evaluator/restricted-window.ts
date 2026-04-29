import {
  CalendarItem,
  type CalendarItem as CalendarItemType,
  pragueDayBucket,
  type RestrictedReason,
  RestrictedReply,
  type RestrictedReply as RestrictedReplyType,
} from '@ankit-prop/contracts';

const RESTRICTED_WINDOW_MS = 5 * 60 * 1000;

export interface RestrictedWindowClock {
  now(): number;
}

export interface RestrictedWindowDb {
  selectEventsBetween(
    fromUtc: string,
    toUtc: string,
    options: { readonly pragueDayBuckets: readonly number[] },
  ): readonly CalendarItemType[];
}

export interface RestrictedWindowMapper {
  resolveAffectedSymbols(rawInstrument: string): readonly string[];
}

export interface RestrictedWindowDeps {
  readonly db: RestrictedWindowDb;
  readonly mapper: RestrictedWindowMapper;
  readonly clock: RestrictedWindowClock;
}

export interface EvaluateRestrictedInput {
  readonly atUtc?: string;
  readonly instruments: readonly string[];
}

export function evaluateRestricted(
  deps: RestrictedWindowDeps,
  input: EvaluateRestrictedInput,
): RestrictedReplyType {
  const instruments = normalizeInstruments(input.instruments);
  if (instruments.length === 0) {
    return restrictedReply([]);
  }

  const atMs = parseAtUtc(input.atUtc ?? new Date(deps.clock.now()).toISOString());
  const fromMs = atMs - RESTRICTED_WINDOW_MS;
  const toMs = atMs + RESTRICTED_WINDOW_MS;
  const events = deps.db.selectEventsBetween(
    new Date(fromMs).toISOString(),
    new Date(toMs).toISOString(),
    {
      pragueDayBuckets: pragueBucketsForWindow(fromMs, toMs),
    },
  );

  const reasons: RestrictedReason[] = [];
  for (const rawEvent of events) {
    const event = CalendarItem.parse(rawEvent);
    if (!isTier1Event(event)) continue;

    const eventMs = Date.parse(event.date);
    if (!Number.isFinite(eventMs) || Math.abs(eventMs - atMs) > RESTRICTED_WINDOW_MS) continue;
    if (!matchesAnyInstrument(event, instruments, deps.mapper)) continue;

    reasons.push({
      event: event.title,
      eta_seconds: Math.trunc((eventMs - atMs) / 1000),
      rule: 'blackout_pm5',
    });
  }

  reasons.sort((a, b) => a.eta_seconds - b.eta_seconds || a.event.localeCompare(b.event));
  return restrictedReply(reasons);
}

function restrictedReply(reasons: RestrictedReason[]): RestrictedReplyType {
  return RestrictedReply.parse({ restricted: reasons.length > 0, reasons });
}

function normalizeInstruments(instruments: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const instrument of instruments) {
    const value = instrument.trim();
    if (value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

function parseAtUtc(atUtc: string): number {
  const atMs = Date.parse(atUtc);
  if (!Number.isFinite(atMs)) {
    throw new RangeError(`restricted-window: invalid atUtc ${JSON.stringify(atUtc)}`);
  }
  return atMs;
}

function pragueBucketsForWindow(fromMs: number, toMs: number): number[] {
  const buckets = [pragueDayBucket(fromMs)];
  const endBucket = pragueDayBucket(toMs);
  if (endBucket !== buckets[0]) {
    buckets.push(endBucket);
  }
  return buckets;
}

function isTier1Event(event: CalendarItemType): boolean {
  return event.impact === 'high' || event.restriction;
}

function matchesAnyInstrument(
  event: CalendarItemType,
  instruments: readonly string[],
  mapper: RestrictedWindowMapper,
): boolean {
  if (event.instrument === 'ALL') return true;
  const affectedSymbols = mapper.resolveAffectedSymbols(event.instrument);
  return instruments.some((instrument) => affectedSymbols.includes(instrument));
}
