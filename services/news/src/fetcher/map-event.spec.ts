import { describe, expect, test } from 'bun:test';

import type { CalendarItem } from '@ankit-prop/contracts';

import { CalendarItemMapError, mapCalendarItemToEvent } from './map-event.ts';

describe('mapCalendarItemToEvent', () => {
  test('maps a representative FTMO item to the persisted CalendarEvent shape', () => {
    const item = calendarItem();

    expect(mapCalendarItemToEvent(item)).toEqual({
      id: 'ftmo-45f0b066fe2ce30c',
      eventTsUtc: '2026-04-03T12:30:00.000Z',
      currency: 'USD',
      date: '2026-04-03T14:30:00+02:00',
      title: 'Non-Farm Employment Change',
      impact: 'high',
      instrument: 'USD + US Indices + XAUUSD + DXY',
      instrumentTags: ['USD', 'US Indices', 'XAUUSD', 'DXY'],
      restricted: true,
      eventType: 'normal',
      forecast: '65 K',
      previous: '-92 K',
      actual: null,
      youtubeLink: 'https://www.youtube.com/watch?v=oQwt0cXetzo',
      articleLink: 'https://ftmo.com/en/economic-calendar-watch-out-for-volatility-during-nfp/',
    });
  });

  test('uses the first non-empty instrument tag as currency and keeps all tags', () => {
    const event = mapCalendarItemToEvent(calendarItem());

    expect(event.currency).toBe('USD');
    expect(event.instrumentTags).toEqual(['USD', 'US Indices', 'XAUUSD', 'DXY']);
  });

  test('throws a typed error for unparseable dates', () => {
    expect(() => mapCalendarItemToEvent(calendarItem({ date: 'not-a-date' }))).toThrow(
      CalendarItemMapError,
    );

    try {
      mapCalendarItemToEvent(calendarItem({ date: 'not-a-date' }));
    } catch (error) {
      expect(error).toBeInstanceOf(CalendarItemMapError);
      expect((error as CalendarItemMapError).field).toBe('date');
    }
  });

  test('rejects offsetless ISO-8601 dates as schema drift (no host-timezone parse)', () => {
    const date = '2026-04-03T14:30:00';

    expect(() => mapCalendarItemToEvent(calendarItem({ date }))).toThrow(CalendarItemMapError);

    try {
      mapCalendarItemToEvent(calendarItem({ date }));
    } catch (error) {
      expect(error).toBeInstanceOf(CalendarItemMapError);
      expect((error as CalendarItemMapError).field).toBe('date');
      expect((error as Error).message).toContain(date);
    }
  });

  test('rejects impossible calendar dates instead of silently rolling over', () => {
    const date = '2026-02-31T14:30:00+01:00';

    expect(() => mapCalendarItemToEvent(calendarItem({ date }))).toThrow(CalendarItemMapError);

    try {
      mapCalendarItemToEvent(calendarItem({ date }));
    } catch (error) {
      expect(error).toBeInstanceOf(CalendarItemMapError);
      expect((error as CalendarItemMapError).field).toBe('date');
      expect((error as Error).message).toContain(date);
    }
  });

  test('generates a deterministic id for identical input', () => {
    const item = calendarItem();

    expect(mapCalendarItemToEvent(item).id).toBe(mapCalendarItemToEvent(item).id);
  });
});

function calendarItem(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    title: 'Non-Farm Employment Change',
    impact: 'high',
    instrument: 'USD + US Indices + XAUUSD + DXY',
    restriction: true,
    eventType: 'normal',
    date: '2026-04-03T14:30:00+02:00',
    forecast: '65 K',
    previous: '-92 K',
    actual: null,
    youtubeLink: 'https://www.youtube.com/watch?v=oQwt0cXetzo',
    articleLink: 'https://ftmo.com/en/economic-calendar-watch-out-for-volatility-during-nfp/',
    ...overrides,
  };
}
