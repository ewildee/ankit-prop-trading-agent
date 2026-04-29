import { describe, expect, test } from 'bun:test';

import { CALENDAR_FETCH_BACKOFF_DELAYS_MS, calendarFetchBackoffDelayMs } from './backoff.ts';

describe('calendarFetchBackoffDelayMs', () => {
  test('returns deterministic exponential delays before surrender', () => {
    expect(CALENDAR_FETCH_BACKOFF_DELAYS_MS).toEqual([1_000, 4_000, 16_000]);
    expect(calendarFetchBackoffDelayMs(1)).toBe(1_000);
    expect(calendarFetchBackoffDelayMs(2)).toBe(4_000);
    expect(calendarFetchBackoffDelayMs(3)).toBe(16_000);
    expect(calendarFetchBackoffDelayMs(4)).toBeNull();
  });

  test('rejects invalid failure numbers', () => {
    expect(calendarFetchBackoffDelayMs(0)).toBeNull();
    expect(calendarFetchBackoffDelayMs(-1)).toBeNull();
    expect(calendarFetchBackoffDelayMs(1.5)).toBeNull();
  });
});
