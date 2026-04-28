import { describe, expect, test } from 'bun:test';
import {
  CalendarImpact,
  CalendarItem,
  CalendarResponse,
  NextRestrictedReply,
  PHASE_0_SENTINEL,
  RestrictedReason,
  RestrictedReply,
} from './index.ts';

describe('shared-contracts smoke', () => {
  test('phase-0 sentinel is exported and stable', () => {
    expect(PHASE_0_SENTINEL).toBe('phase-0-scaffold');
  });
});

describe('shared-contracts barrel re-exports news contracts', () => {
  const minimalItem = {
    title: 'NFP',
    impact: 'high',
    instrument: 'USD',
    restriction: true,
    eventType: 'normal',
    date: '2026-04-03T14:30:00+02:00',
    forecast: null,
    previous: null,
    actual: null,
    youtubeLink: null,
    articleLink: null,
  };

  test('CalendarImpact is a Zod enum reachable from the barrel', () => {
    expect(CalendarImpact.parse('high')).toBe('high');
    expect(() => CalendarImpact.parse('extreme')).toThrow();
  });

  test('CalendarItem parses a minimal valid item via the barrel export', () => {
    const parsed = CalendarItem.parse(minimalItem);
    expect(parsed.impact).toBe('high');
    expect(parsed.restriction).toBe(true);
  });

  test('CalendarResponse parses an empty items array via the barrel export', () => {
    expect(CalendarResponse.parse({ items: [] }).items).toEqual([]);
  });

  test('RestrictedReason and RestrictedReply round-trip via the barrel export', () => {
    const reason = { event: 'NFP', eta_seconds: -120, rule: 'pre_news_2h' as const };
    const reply = { restricted: true, reasons: [reason] };
    expect(RestrictedReply.parse(reply)).toEqual(reply);
    expect(RestrictedReason.parse(reason)).toEqual(reason);
  });

  test('NextRestrictedReply accepts null item via the barrel export', () => {
    expect(NextRestrictedReply.parse({ item: null, eta_seconds: 0 })).toEqual({
      item: null,
      eta_seconds: 0,
    });
  });
});
