import { describe, expect, test } from 'bun:test';
import {
  CalendarImpact,
  CalendarItem,
  CalendarResponse,
  NextRestrictedReply,
  RestrictedReason,
  RestrictedReply,
} from './news.ts';

const minimalCalendarItem = {
  title: 'US Non-Farm Payrolls',
  impact: 'medium',
  instrument: 'USD + US Indices + XAUUSD + DXY',
  restriction: false,
  eventType: 'normal',
  date: '2026-04-28T14:30:00+02:00',
  forecast: null,
  previous: null,
  actual: null,
  youtubeLink: null,
  articleLink: null,
} as const;

describe('news calendar contracts', () => {
  test('CalendarItem parses the minimal valid FTMO calendar item', () => {
    const parsed = CalendarItem.parse(minimalCalendarItem);

    expect(parsed.title).toBe('US Non-Farm Payrolls');
    expect(parsed.instrument).toBe('USD + US Indices + XAUUSD + DXY');
    expect(parsed.forecast).toBeNull();
  });

  test('CalendarResponse wraps calendar items', () => {
    const parsed = CalendarResponse.parse({ items: [minimalCalendarItem] });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.impact).toBe('medium');
  });

  test('eventType accepts unknown strings for runtime metric handling', () => {
    const parsed = CalendarItem.parse({
      ...minimalCalendarItem,
      eventType: 'surprise-auction',
    });

    expect(parsed.eventType).toBe('surprise-auction');
  });

  test('restriction true and high impact are both valid tier-1 routes', () => {
    expect(
      CalendarItem.parse({
        ...minimalCalendarItem,
        impact: 'low',
        restriction: true,
      }).restriction,
    ).toBe(true);

    expect(
      CalendarItem.parse({
        ...minimalCalendarItem,
        impact: 'high',
        restriction: false,
      }).impact,
    ).toBe('high');
  });

  test('RestrictedReply round-trips all restriction rules', () => {
    const reply = RestrictedReply.parse({
      restricted: true,
      reasons: [
        { event: 'US CPI', eta_seconds: -60, rule: 'blackout_pm5' },
        { event: 'FOMC Statement', eta_seconds: 3600, rule: 'pre_news_2h' },
        { event: 'calendar stale', eta_seconds: 0, rule: 'stale_calendar' },
      ],
    });

    expect(reply.restricted).toBe(true);
    expect(reply.reasons.map((reason) => reason.rule)).toEqual([
      'blackout_pm5',
      'pre_news_2h',
      'stale_calendar',
    ]);
  });

  test('RestrictedReason rule enum is exhaustive and closed', () => {
    expect(RestrictedReason.shape.rule.options).toEqual([
      'blackout_pm5',
      'pre_news_2h',
      'stale_calendar',
    ]);
    expect(() =>
      RestrictedReason.parse({
        event: 'US CPI',
        eta_seconds: 30,
        rule: 'unknown_rule',
      }),
    ).toThrow();
  });

  test('NextRestrictedReply accepts either a calendar item or null', () => {
    expect(
      NextRestrictedReply.parse({
        item: minimalCalendarItem,
        eta_seconds: 600,
      }).item?.title,
    ).toBe('US Non-Farm Payrolls');

    expect(
      NextRestrictedReply.parse({
        item: null,
        eta_seconds: 0,
      }).item,
    ).toBeNull();
  });

  test('CalendarImpact is the closed BLUEPRINT impact enum', () => {
    expect(CalendarImpact.options).toEqual(['low', 'medium', 'high', 'holiday']);
    expect(() =>
      CalendarItem.parse({
        ...minimalCalendarItem,
        impact: 'critical',
      }),
    ).toThrow();
  });
});
