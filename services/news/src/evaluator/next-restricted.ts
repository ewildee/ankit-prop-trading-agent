import {
  CalendarItem,
  type CalendarItem as CalendarItemType,
  NextRestrictedReply,
  type NextRestrictedReply as NextRestrictedReplyType,
} from '@ankit-prop/contracts';
import {
  type InstrumentMatcher,
  matchesAnyInstrument,
  normalizeInstruments,
  parseAtUtc,
  pragueBucketsForWindow,
} from './_match.ts';

const RESTRICTED_WINDOW_MS = 5 * 60 * 1000;
// 48h horizon
const NEXT_RESTRICTED_HORIZON_MS = 48 * 60 * 60 * 1000;

// Future /calendar/next-restricted route handlers must catch this and emit the standard fail-closed payload.
export class MalformedCalendarRowError extends Error {
  constructor(
    readonly count: number,
    readonly horizon: { fromUtc: string; toUtc: string },
  ) {
    super(`malformed calendar row(s) in next-restricted horizon: ${count}`);
    this.name = 'MalformedCalendarRowError';
  }
}

export interface NextRestrictedClock {
  now(): number;
}

export interface NextRestrictedDb {
  selectEventsBetween(
    fromUtc: string,
    toUtc: string,
    options: { readonly pragueDayBuckets: readonly number[] },
  ): readonly unknown[];
}

export type NextRestrictedMapper = InstrumentMatcher;

export interface NextRestrictedDeps {
  readonly db: NextRestrictedDb;
  readonly mapper: NextRestrictedMapper;
  readonly clock: NextRestrictedClock;
}

export interface FindNextRestrictedInput {
  readonly atUtc?: string;
  readonly instrument?: string;
  readonly instruments?: readonly string[];
}

export function findNextRestricted(
  deps: NextRestrictedDeps,
  input: FindNextRestrictedInput,
): NextRestrictedReplyType {
  const instruments = normalizeInstruments(
    input.instruments ?? (input.instrument === undefined ? [] : [input.instrument]),
  );
  if (instruments.length === 0) {
    return nextRestrictedReply(null, 0);
  }

  const atMs = parseAtUtc(
    input.atUtc ?? new Date(deps.clock.now()).toISOString(),
    'next-restricted',
  );
  const fromMs = atMs - RESTRICTED_WINDOW_MS;
  const toMs = atMs + NEXT_RESTRICTED_HORIZON_MS;
  const horizon = {
    fromUtc: new Date(fromMs).toISOString(),
    toUtc: new Date(toMs).toISOString(),
  };
  const events = deps.db.selectEventsBetween(horizon.fromUtc, horizon.toUtc, {
    pragueDayBuckets: pragueBucketsForWindow(fromMs, toMs),
  });

  const matches: CalendarItemType[] = [];
  let malformedCount = 0;
  for (const rawEvent of events) {
    const parsed = CalendarItem.safeParse(rawEvent);
    if (!parsed.success) {
      malformedCount += 1;
      continue;
    }
    const event = parsed.data;
    const eventMs = Date.parse(event.date);
    if (!Number.isFinite(eventMs)) {
      malformedCount += 1;
      continue;
    }
    if (eventMs < fromMs || eventMs > toMs) continue;
    if (event.restriction !== true) continue;
    if (!matchesAnyInstrument(event, instruments, deps.mapper)) continue;
    matches.push(event);
  }

  if (malformedCount > 0) {
    // fail-closed per BLUEPRINT §9 rail 13 / §11.6
    throw new MalformedCalendarRowError(malformedCount, horizon);
  }

  matches.sort(compareCalendarItems);
  const item = matches[0] ?? null;
  if (item === null) {
    return nextRestrictedReply(null, 0);
  }

  const etaSeconds = Math.max(0, Math.trunc((Date.parse(item.date) - atMs) / 1000));
  return nextRestrictedReply(item, etaSeconds);
}

function nextRestrictedReply(
  item: CalendarItemType | null,
  etaSeconds: number,
): NextRestrictedReplyType {
  return NextRestrictedReply.parse({ item, eta_seconds: etaSeconds });
}

function compareCalendarItems(a: CalendarItemType, b: CalendarItemType): number {
  const byTime = Date.parse(a.date) - Date.parse(b.date);
  if (byTime !== 0) return byTime;
  const byTitle = a.title.localeCompare(b.title);
  if (byTitle !== 0) return byTitle;
  return a.instrument.localeCompare(b.instrument);
}
