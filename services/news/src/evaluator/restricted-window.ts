import {
  CalendarItem,
  type CalendarItem as CalendarItemType,
  type RestrictedReason,
  RestrictedReply,
  type RestrictedReply as RestrictedReplyType,
} from '@ankit-prop/contracts';
import {
  type InstrumentMatcher,
  matchesAnyInstrument,
  normalizeInstruments,
  parseAtUtc,
  pragueBucketsForWindow,
} from './_match.ts';

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

export type RestrictedWindowMapper = InstrumentMatcher;

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

  const atMs = parseAtUtc(
    input.atUtc ?? new Date(deps.clock.now()).toISOString(),
    'restricted-window',
  );
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
    if (!isRestrictedEvent(event)) continue;

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

function isRestrictedEvent(event: CalendarItemType): boolean {
  return event.restriction === true;
}
