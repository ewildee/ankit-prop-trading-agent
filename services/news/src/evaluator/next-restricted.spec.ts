import { describe, expect, test } from 'bun:test';
import type { CalendarItem } from '@ankit-prop/contracts';
import {
  findNextRestricted,
  MalformedCalendarRowError,
  type NextRestrictedDb,
} from './next-restricted.ts';

const AT_UTC = '2026-04-28T12:00:00Z';
const MAP = new Map<string, readonly string[]>([
  ['USD', ['NAS100', 'XAUUSD']],
  ['Gold', ['XAUUSD']],
  ['US Indices', ['NAS100']],
  ['USD + Gold', ['NAS100', 'XAUUSD']],
]);

describe('findNextRestricted', () => {
  test('returns a 30-minute tier-1 event with the correct ETA', () => {
    const db = dbWithEvents([
      event({ title: 'US CPI', date: '2026-04-28T12:30:00Z', impact: 'high' }),
    ]);

    const reply = findNextRestricted(deps(db), { atUtc: AT_UTC, instruments: ['XAUUSD'] });

    expect(reply).toEqual({
      item: event({ title: 'US CPI', date: '2026-04-28T12:30:00Z', impact: 'high' }),
      eta_seconds: 1800,
    });
    expect(db.calls[0]?.fromUtc).toBe('2026-04-28T11:55:00.000Z');
    expect(db.calls[0]?.toUtc).toBe('2026-04-30T12:00:00.000Z');
  });

  test('returns a tier-1 event six hours out with the correct ETA', () => {
    const db = dbWithEvents([
      event({ title: 'FOMC Minutes', date: '2026-04-28T18:00:00Z', restriction: true }),
    ]);

    expect(findNextRestricted(deps(db), { atUtc: AT_UTC, instruments: ['XAUUSD'] })).toEqual({
      item: event({ title: 'FOMC Minutes', date: '2026-04-28T18:00:00Z', restriction: true }),
      eta_seconds: 21_600,
    });
  });

  test('selects the earliest matching event for the requested instrument set', () => {
    const db = dbWithEvents([
      event({ title: 'Gold later', instrument: 'Gold', date: '2026-04-28T14:00:00Z' }),
      event({
        title: 'Indices earliest',
        instrument: 'US Indices',
        date: '2026-04-28T12:20:00Z',
      }),
      event({
        title: 'Dollar middle',
        instrument: 'USD',
        date: '2026-04-28T12:45:00Z',
      }),
    ]);

    expect(
      findNextRestricted(deps(db), {
        atUtc: AT_UTC,
        instruments: ['XAUUSD', 'NAS100'],
      }),
    ).toEqual({
      item: event({
        title: 'Indices earliest',
        instrument: 'US Indices',
        date: '2026-04-28T12:20:00Z',
      }),
      eta_seconds: 1200,
    });
  });

  test('returns null when no tier-1 event exists inside the 48h horizon', () => {
    const db = dbWithEvents([
      event({
        title: 'Low impact ignored',
        impact: 'low',
        restriction: false,
        date: '2026-04-28T12:30:00Z',
      }),
      event({ title: 'Too late', date: '2026-04-30T12:00:01Z' }),
      event({ title: 'Wrong symbol', instrument: 'US Indices', date: '2026-04-28T12:30:00Z' }),
    ]);

    expect(findNextRestricted(deps(db), { atUtc: AT_UTC, instruments: ['XAUUSD'] })).toEqual({
      item: null,
      eta_seconds: 0,
    });
  });

  test('clamps ETA to zero for an event currently inside the restricted window', () => {
    const db = dbWithEvents([
      event({ title: 'Just happened', date: '2026-04-28T11:57:00Z', restriction: true }),
    ]);

    expect(findNextRestricted(deps(db), { atUtc: AT_UTC, instruments: ['XAUUSD'] })).toEqual({
      item: event({ title: 'Just happened', date: '2026-04-28T11:57:00Z', restriction: true }),
      eta_seconds: 0,
    });
  });

  test('returns null for empty instruments without querying the DB', () => {
    const db = dbWithEvents([event()]);

    expect(findNextRestricted(deps(db), { atUtc: AT_UTC, instruments: [] })).toEqual({
      item: null,
      eta_seconds: 0,
    });
    expect(findNextRestricted(deps(db), { atUtc: AT_UTC })).toEqual({
      item: null,
      eta_seconds: 0,
    });
    expect(db.calls).toHaveLength(0);
  });

  test('uses stable title ordering when event times tie', () => {
    const db = dbWithEvents([
      event({ title: 'B title', date: '2026-04-28T12:30:00Z' }),
      event({ title: 'A title', date: '2026-04-28T12:30:00Z' }),
    ]);

    expect(findNextRestricted(deps(db), { atUtc: AT_UTC, instrument: 'XAUUSD' }).item?.title).toBe(
      'A title',
    );
  });

  test('computes Prague day buckets across the 48h lookup window', () => {
    const db = dbWithEvents([event()]);

    findNextRestricted(deps(db), {
      atUtc: '2026-03-29T21:59:00Z',
      instrument: 'XAUUSD',
    });

    expect(db.calls[0]?.pragueDayBuckets).toEqual([
      Date.UTC(2026, 2, 29),
      Date.UTC(2026, 2, 30),
      Date.UTC(2026, 2, 31),
    ]);
  });

  test('excludes high-impact non-restricted events at near and six-hour offsets', () => {
    const db = dbWithEvents([
      event({
        title: 'High impact near',
        impact: 'high',
        restriction: false,
        date: '2026-04-28T12:30:00Z',
      }),
    ]);
    const laterDb = dbWithEvents([
      event({
        title: 'High impact later',
        impact: 'high',
        restriction: false,
        date: '2026-04-28T18:00:00Z',
      }),
    ]);

    expect(findNextRestricted(deps(db), { atUtc: AT_UTC, instruments: ['XAUUSD'] })).toEqual({
      item: null,
      eta_seconds: 0,
    });
    expect(findNextRestricted(deps(laterDb), { atUtc: AT_UTC, instruments: ['XAUUSD'] })).toEqual({
      item: null,
      eta_seconds: 0,
    });
  });

  test('high-impact non-restricted event does not shadow a real restricted event', () => {
    const restricted = event({
      title: 'Restricted FOMC',
      impact: 'high',
      restriction: true,
      date: '2026-04-28T18:00:00Z',
    });
    const db = dbWithEvents([
      event({
        title: 'High impact near',
        impact: 'high',
        restriction: false,
        date: '2026-04-28T12:30:00Z',
      }),
      restricted,
    ]);

    expect(findNextRestricted(deps(db), { atUtc: AT_UTC, instruments: ['XAUUSD'] })).toEqual({
      item: restricted,
      eta_seconds: 21_600,
    });
  });

  test('throws on malformed calendar rows', () => {
    const db = dbWithEvents([{ title: 'missing required fields' }]);

    expect(() => findNextRestricted(deps(db), { atUtc: AT_UTC, instruments: ['XAUUSD'] })).toThrow(
      MalformedCalendarRowError,
    );
    expectMalformedCount(db, 1);
  });

  test('throws on malformed calendar dates', () => {
    const db = dbWithEvents([event({ date: 'not-a-date' })]);

    expect(() => findNextRestricted(deps(db), { atUtc: AT_UTC, instruments: ['XAUUSD'] })).toThrow(
      MalformedCalendarRowError,
    );
    expectMalformedCount(db, 1);
  });

  test('malformed rows poison the horizon even when a restricted match exists', () => {
    const db = dbWithEvents([
      event({ title: 'Good restricted event', date: '2026-04-28T12:30:00Z' }),
      { title: 'missing required fields' },
    ]);

    expect(() => findNextRestricted(deps(db), { atUtc: AT_UTC, instruments: ['XAUUSD'] })).toThrow(
      MalformedCalendarRowError,
    );
    expectMalformedCount(db, 1);
  });
});

function deps(db: RecordingDb) {
  return {
    db,
    mapper: {
      resolveAffectedSymbols(rawInstrument: string): readonly string[] {
        return MAP.get(rawInstrument) ?? [];
      },
    },
    clock: {
      now: () => Date.parse(AT_UTC),
    },
  };
}

interface RecordingDb extends NextRestrictedDb {
  readonly calls: {
    readonly fromUtc: string;
    readonly toUtc: string;
    readonly pragueDayBuckets: readonly number[];
  }[];
}

function dbWithEvents(events: readonly unknown[]): RecordingDb {
  return {
    calls: [],
    selectEventsBetween(fromUtc, toUtc, options) {
      this.calls.push({ fromUtc, toUtc, pragueDayBuckets: options.pragueDayBuckets });
      return events;
    },
  };
}

function event(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    title: 'US CPI',
    impact: 'high',
    instrument: 'USD',
    restriction: true,
    eventType: 'normal',
    date: '2026-04-28T12:00:00Z',
    forecast: null,
    previous: null,
    actual: null,
    youtubeLink: null,
    articleLink: null,
    ...overrides,
  };
}

function expectMalformedCount(db: RecordingDb, count: number): void {
  try {
    findNextRestricted(deps(db), { atUtc: AT_UTC, instruments: ['XAUUSD'] });
  } catch (error) {
    expect(error).toBeInstanceOf(MalformedCalendarRowError);
    expect((error as MalformedCalendarRowError).count).toBe(count);
    return;
  }

  throw new Error('expected MalformedCalendarRowError');
}
