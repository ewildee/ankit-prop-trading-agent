import { describe, expect, test } from 'bun:test';
import type { CalendarItem } from '@ankit-prop/contracts';
import type { SymbolTagMap } from '../symbol-tag-mapper.ts';
import { evaluatePreNews, type PreNewsDb } from './pre-news.ts';

const MAP: SymbolTagMap = {
  mappings: {
    USD: { affects: ['NAS100', 'XAUUSD'] },
    'US Indices': { affects: ['NAS100'] },
    XAUUSD: { affects: ['XAUUSD'] },
    EUR: { affects: [] },
  },
};

const BASE_EVENT: CalendarItem = {
  title: 'US Non-Farm Payrolls',
  impact: 'high',
  instrument: 'USD + US Indices + XAUUSD',
  restriction: false,
  eventType: 'normal',
  date: '2026-04-28T12:00:00Z',
  forecast: null,
  previous: null,
  actual: null,
  youtubeLink: null,
  articleLink: null,
};

describe('evaluatePreNews', () => {
  test('returns unrestricted for empty instruments without querying the database', () => {
    let queried = false;
    const reply = evaluatePreNews(
      {
        db: db([], () => {
          queried = true;
        }),
        mapper: MAP,
      },
      { atUtc: '2026-04-28T12:00:00Z', instruments: [] },
    );

    expect(reply).toEqual({ restricted: false, reasons: [] });
    expect(queried).toBe(false);
  });

  test('queries the exact half-open two-hour UTC range and filters mixed boundary events', () => {
    const observed: string[][] = [];
    const reply = evaluatePreNews(
      {
        db: db(
          [
            event({ date: '2026-04-28T11:59:00Z', title: 'Before Window' }),
            event({ date: '2026-04-28T12:00:00Z', title: 'At Window Start' }),
            event({ date: '2026-04-28T13:59:00Z', title: 'Inside Final Minute' }),
            event({ date: '2026-04-28T14:00:00Z', title: 'At Exclusive End' }),
            event({ date: '2026-04-28T12:30:00Z', impact: 'medium', title: 'Tier Two' }),
            event({ date: '2026-04-28T13:00:00Z', impact: 'low', title: 'Tier Three' }),
            event({
              date: '2026-04-28T12:45:00Z',
              instrument: 'EUR',
              title: 'Unmapped Instrument',
            }),
          ],
          (fromUtc, toUtc) => observed.push([fromUtc, toUtc]),
        ),
        mapper: MAP,
      },
      { atUtc: '2026-04-28T12:00:00Z', instruments: ['XAUUSD'] },
    );

    expect(observed).toEqual([['2026-04-28T12:00:00.000Z', '2026-04-28T14:00:00.000Z']]);
    expect(reply).toEqual({
      restricted: true,
      reasons: [
        { event: 'At Window Start', eta_seconds: 0, rule: 'pre_news_2h' },
        { event: 'Inside Final Minute', eta_seconds: 7140, rule: 'pre_news_2h' },
      ],
    });
  });

  test('uses clock.nowUtc when atUtc is omitted', () => {
    const observed: string[][] = [];
    const reply = evaluatePreNews(
      {
        db: db(
          [event({ date: '2026-04-28T12:30:00Z', title: 'Clock-Sourced Event' })],
          (fromUtc, toUtc) => observed.push([fromUtc, toUtc]),
        ),
        mapper: MAP,
        clock: { nowUtc: () => '2026-04-28T12:00:00Z' },
      },
      { instruments: ['XAUUSD'] },
    );

    expect(observed).toEqual([['2026-04-28T12:00:00.000Z', '2026-04-28T14:00:00.000Z']]);
    expect(reply).toEqual({
      restricted: true,
      reasons: [{ event: 'Clock-Sourced Event', eta_seconds: 1800, rule: 'pre_news_2h' }],
    });
  });

  test('fails closed when both atUtc and clock are omitted', () => {
    const reply = evaluatePreNews({ db: db([]), mapper: MAP }, { instruments: ['XAUUSD'] });

    expect(reply).toEqual({
      restricted: true,
      reasons: [{ event: 'invalid_pre_news_time', eta_seconds: 0, rule: 'stale_calendar' }],
    });
  });

  test('fails closed when evaluation time is malformed', () => {
    const reply = evaluatePreNews(
      { db: db([]), mapper: MAP },
      { atUtc: 'not-a-date', instruments: ['XAUUSD'] },
    );

    expect(reply).toEqual({
      restricted: true,
      reasons: [{ event: 'invalid_pre_news_time', eta_seconds: 0, rule: 'stale_calendar' }],
    });
  });

  test('fails closed on malformed relevant tier-1 event dates', () => {
    const reply = evaluatePreNews(
      { db: db([event({ date: 'not-a-date', title: 'Malformed NFP' })]), mapper: MAP },
      { atUtc: '2026-04-28T12:00:00Z', instruments: ['XAUUSD'] },
    );

    expect(reply).toEqual({
      restricted: true,
      reasons: [
        {
          event: 'malformed_calendar_event_date:Malformed NFP',
          eta_seconds: 0,
          rule: 'stale_calendar',
        },
      ],
    });
  });

  test('includes tier-1 events exactly at atUtc', () => {
    const reply = evaluatePreNews(
      { db: db([event({ date: '2026-04-28T12:00:00Z', title: 'FOMC Statement' })]), mapper: MAP },
      { atUtc: '2026-04-28T12:00:00Z', instruments: ['XAUUSD'] },
    );

    expect(reply).toEqual({
      restricted: true,
      reasons: [{ event: 'FOMC Statement', eta_seconds: 0, rule: 'pre_news_2h' }],
    });
  });

  test('includes tier-1 events at atUtc + 1h59m', () => {
    const reply = evaluatePreNews(
      { db: db([event({ date: '2026-04-28T13:59:00Z', title: 'US CPI' })]), mapper: MAP },
      { atUtc: '2026-04-28T12:00:00Z', instruments: ['NAS100'] },
    );

    expect(reply).toEqual({
      restricted: true,
      reasons: [{ event: 'US CPI', eta_seconds: 7140, rule: 'pre_news_2h' }],
    });
  });

  test('excludes events exactly at atUtc + 2h', () => {
    const reply = evaluatePreNews(
      { db: db([event({ date: '2026-04-28T14:00:00Z', title: 'US CPI' })]), mapper: MAP },
      { atUtc: '2026-04-28T12:00:00Z', instruments: ['XAUUSD'] },
    );

    expect(reply).toEqual({ restricted: false, reasons: [] });
  });

  test('excludes tier-1 events before atUtc', () => {
    const reply = evaluatePreNews(
      { db: db([event({ date: '2026-04-28T11:59:00Z', title: 'US CPI' })]), mapper: MAP },
      { atUtc: '2026-04-28T12:00:00Z', instruments: ['XAUUSD'] },
    );

    expect(reply).toEqual({ restricted: false, reasons: [] });
  });

  test('excludes tier-2 and tier-3 events in the two-hour window', () => {
    const reply = evaluatePreNews(
      {
        db: db([
          event({ date: '2026-04-28T12:30:00Z', impact: 'medium', title: 'ISM PMI' }),
          event({ date: '2026-04-28T13:00:00Z', impact: 'low', title: 'Factory Orders' }),
        ]),
        mapper: MAP,
      },
      { atUtc: '2026-04-28T12:00:00Z', instruments: ['XAUUSD'] },
    );

    expect(reply).toEqual({ restricted: false, reasons: [] });
  });

  test('treats restriction=true as tier-1 even when impact is not high', () => {
    const reply = evaluatePreNews(
      {
        db: db([
          event({
            date: '2026-04-28T12:30:00Z',
            impact: 'medium',
            restriction: true,
            title: 'Restricted ECB Event',
          }),
        ]),
        mapper: MAP,
      },
      { atUtc: '2026-04-28T12:00:00Z', instruments: ['XAUUSD'] },
    );

    expect(reply).toEqual({
      restricted: true,
      reasons: [{ event: 'Restricted ECB Event', eta_seconds: 1800, rule: 'pre_news_2h' }],
    });
  });

  test('maps FTMO instrument tags to requested tracked instruments', () => {
    const reply = evaluatePreNews(
      { db: db([event({ instrument: 'USD', title: 'US Retail Sales' })]), mapper: MAP },
      { atUtc: '2026-04-28T11:00:00Z', instruments: ['NAS100'] },
    );

    expect(reply).toEqual({
      restricted: true,
      reasons: [{ event: 'US Retail Sales', eta_seconds: 3600, rule: 'pre_news_2h' }],
    });
  });

  test('does not match events whose tags do not affect the requested instruments', () => {
    const reply = evaluatePreNews(
      { db: db([event({ instrument: 'EUR', title: 'ECB Lane Speech' })]), mapper: MAP },
      { atUtc: '2026-04-28T11:00:00Z', instruments: ['XAUUSD'] },
    );

    expect(reply).toEqual({ restricted: false, reasons: [] });
  });

  test('does not treat ALL as a global instrument sentinel', () => {
    const reply = evaluatePreNews(
      { db: db([event({ instrument: 'ALL', title: 'All-market calendar row' })]), mapper: MAP },
      { atUtc: '2026-04-28T11:00:00Z', instruments: ['XAUUSD'] },
    );

    expect(reply).toEqual({ restricted: false, reasons: [] });
  });

  test('matches ALL only when the symbol-tag map affects the requested instrument', () => {
    const reply = evaluatePreNews(
      {
        db: db([event({ instrument: 'ALL', title: 'Mapped all-market calendar row' })]),
        mapper: { mappings: { ...MAP.mappings, ALL: { affects: ['NAS100'] } } },
      },
      { atUtc: '2026-04-28T11:00:00Z', instruments: ['NAS100'] },
    );

    expect(reply).toEqual({
      restricted: true,
      reasons: [
        { event: 'Mapped all-market calendar row', eta_seconds: 3600, rule: 'pre_news_2h' },
      ],
    });
  });

  test('queries a UTC two-hour range across Prague DST spring-forward without shrinking', () => {
    const observed: string[][] = [];
    const reply = evaluatePreNews(
      {
        db: db(
          [event({ date: '2026-03-29T04:29:00+02:00', title: 'DST Spring Event' })],
          (fromUtc, toUtc) => observed.push([fromUtc, toUtc]),
        ),
        mapper: MAP,
      },
      { atUtc: '2026-03-29T00:30:00Z', instruments: ['XAUUSD'] },
    );

    expect(observed).toEqual([['2026-03-29T00:30:00.000Z', '2026-03-29T02:30:00.000Z']]);
    expect(reply).toEqual({
      restricted: true,
      reasons: [{ event: 'DST Spring Event', eta_seconds: 7140, rule: 'pre_news_2h' }],
    });
  });

  test('queries a UTC two-hour range across Prague DST fall-back without stretching', () => {
    const observed: string[][] = [];
    const reply = evaluatePreNews(
      {
        db: db(
          [event({ date: '2026-10-25T03:29:00+01:00', title: 'DST Fall Event' })],
          (fromUtc, toUtc) => observed.push([fromUtc, toUtc]),
        ),
        mapper: MAP,
      },
      { atUtc: '2026-10-25T00:30:00Z', instruments: ['XAUUSD'] },
    );

    expect(observed).toEqual([['2026-10-25T00:30:00.000Z', '2026-10-25T02:30:00.000Z']]);
    expect(reply).toEqual({
      restricted: true,
      reasons: [{ event: 'DST Fall Event', eta_seconds: 7140, rule: 'pre_news_2h' }],
    });
  });
});

function db(
  items: readonly CalendarItem[],
  onQuery?: (fromUtc: string, toUtc: string) => void,
): PreNewsDb {
  return {
    queryRange(fromUtc: string, toUtc: string) {
      onQuery?.(fromUtc, toUtc);
      return items;
    },
  };
}

function event(overrides: Partial<CalendarItem>): CalendarItem {
  return { ...BASE_EVENT, ...overrides };
}
