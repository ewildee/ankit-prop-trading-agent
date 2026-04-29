import { describe, expect, test } from 'bun:test';
import type { CalendarItem } from '@ankit-prop/contracts';
import { evaluateRestricted, type RestrictedWindowDb } from './restricted-window.ts';

const AT_UTC = '2026-04-28T12:00:00Z';
const MAP = new Map<string, readonly string[]>([
  ['USD', ['NAS100', 'XAUUSD']],
  ['Gold', ['XAUUSD']],
  ['US Indices', ['NAS100']],
  ['USD + Gold', ['NAS100', 'XAUUSD']],
]);

describe('evaluateRestricted', () => {
  test('includes tier-1 events at +0, +4, and +5 minutes but excludes +6 minutes', () => {
    const db = dbWithEvents([
      event({ title: 'At now', date: '2026-04-28T12:00:00Z' }),
      event({ title: 'Plus four', date: '2026-04-28T12:04:00Z' }),
      event({ title: 'Plus five', date: '2026-04-28T12:05:00Z' }),
      event({ title: 'Plus six', date: '2026-04-28T12:06:00Z' }),
    ]);

    const reply = evaluateRestricted(deps(db), { atUtc: AT_UTC, instruments: ['XAUUSD'] });

    expect(reply).toEqual({
      restricted: true,
      reasons: [
        { event: 'At now', eta_seconds: 0, rule: 'blackout_pm5' },
        { event: 'Plus four', eta_seconds: 240, rule: 'blackout_pm5' },
        { event: 'Plus five', eta_seconds: 300, rule: 'blackout_pm5' },
      ],
    });
    expect(db.calls[0]?.fromUtc).toBe('2026-04-28T11:55:00.000Z');
    expect(db.calls[0]?.toUtc).toBe('2026-04-28T12:05:00.000Z');
  });

  test('ignores tier-2 and tier-3 events unless FTMO marks them restricted', () => {
    const db = dbWithEvents([
      event({ title: 'Medium ignored', impact: 'medium', date: '2026-04-28T12:00:00Z' }),
      event({ title: 'Low ignored', impact: 'low', date: '2026-04-28T12:01:00Z' }),
      event({
        title: 'Restricted low impact',
        impact: 'low',
        restriction: true,
        date: '2026-04-28T12:02:00Z',
      }),
    ]);

    const reply = evaluateRestricted(deps(db), { atUtc: AT_UTC, instruments: ['XAUUSD'] });

    expect(reply).toEqual({
      restricted: true,
      reasons: [{ event: 'Restricted low impact', eta_seconds: 120, rule: 'blackout_pm5' }],
    });
  });

  test('matches a multi-tag event when either tag affects the instrument', () => {
    const db = dbWithEvents([event({ title: 'Gold and dollar shock', instrument: 'USD + Gold' })]);

    const reply = evaluateRestricted(deps(db), { atUtc: AT_UTC, instruments: ['XAUUSD'] });

    expect(reply.restricted).toBe(true);
    expect(reply.reasons.map((reason) => reason.event)).toEqual(['Gold and dollar shock']);
  });

  test('computes Prague day buckets across the spring DST boundary', () => {
    const db = dbWithEvents([event({ date: '2026-03-29T21:59:00Z' })]);

    evaluateRestricted(deps(db), {
      atUtc: '2026-03-29T21:59:00Z',
      instruments: ['XAUUSD'],
    });

    expect(db.calls[0]?.pragueDayBuckets).toEqual([Date.UTC(2026, 2, 29), Date.UTC(2026, 2, 30)]);
  });

  test('computes Prague day buckets across the fall DST boundary', () => {
    const db = dbWithEvents([event({ date: '2026-10-25T22:59:00Z' })]);

    evaluateRestricted(deps(db), {
      atUtc: '2026-10-25T22:59:00Z',
      instruments: ['XAUUSD'],
    });

    expect(db.calls[0]?.pragueDayBuckets).toEqual([Date.UTC(2026, 9, 25), Date.UTC(2026, 9, 26)]);
  });

  test('returns unrestricted for no matching events and for empty instruments', () => {
    const db = dbWithEvents([event({ instrument: 'US Indices' })]);

    expect(evaluateRestricted(deps(db), { atUtc: AT_UTC, instruments: ['XAUUSD'] })).toEqual({
      restricted: false,
      reasons: [],
    });
    expect(evaluateRestricted(deps(db), { atUtc: AT_UTC, instruments: [] })).toEqual({
      restricted: false,
      reasons: [],
    });
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

interface RecordingDb extends RestrictedWindowDb {
  readonly calls: {
    readonly fromUtc: string;
    readonly toUtc: string;
    readonly pragueDayBuckets: readonly number[];
  }[];
}

function dbWithEvents(events: readonly CalendarItem[]): RecordingDb {
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
    restriction: false,
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
