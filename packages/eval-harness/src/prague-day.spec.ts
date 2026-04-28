// ANKA-41 regression: day buckets must follow Europe/Prague (FTMO server
// clock), not UTC. UTC bucketing leaks 22:00–24:00 UTC trades into the prior
// Prague day, which can mask same-Prague-day breaches.

import { describe, expect, test } from 'bun:test';
import { pragueDayBucket, pragueParts } from './prague-day.ts';

describe('prague-day', () => {
  test('CET (winter): bucket flips at 23:00 UTC, not 00:00 UTC', () => {
    // Prague = UTC+1 in winter. 2026-01-05 22:59 UTC = 23:59 Prague (still
    // day 5); 2026-01-05 23:00 UTC = 00:00 Prague day 6.
    const beforeMidnight = Date.UTC(2026, 0, 5, 22, 59, 0);
    const atMidnight = Date.UTC(2026, 0, 5, 23, 0, 0);
    expect(pragueDayBucket(beforeMidnight)).toBe(Date.UTC(2026, 0, 5));
    expect(pragueDayBucket(atMidnight)).toBe(Date.UTC(2026, 0, 6));
  });

  test('UTC midnight is already Prague day+1 in winter', () => {
    // 2026-01-06 00:00 UTC = 01:00 Prague day 6.
    expect(pragueDayBucket(Date.UTC(2026, 0, 6, 0, 0, 0))).toBe(Date.UTC(2026, 0, 6));
  });

  test('CEST (summer): bucket flips at 22:00 UTC', () => {
    // Prague = UTC+2 during DST. 2026-07-15 21:59 UTC = 23:59 Prague day 15;
    // 2026-07-15 22:00 UTC = 00:00 Prague day 16.
    expect(pragueDayBucket(Date.UTC(2026, 6, 15, 21, 59, 0))).toBe(Date.UTC(2026, 6, 15));
    expect(pragueDayBucket(Date.UTC(2026, 6, 15, 22, 0, 0))).toBe(Date.UTC(2026, 6, 16));
  });

  test('pragueParts returns local Prague calendar fields', () => {
    const p = pragueParts(Date.UTC(2026, 0, 5, 23, 30, 0));
    expect(p.year).toBe(2026);
    expect(p.month).toBe(1);
    expect(p.day).toBe(6);
    expect(p.hour).toBe(0);
    expect(p.minute).toBe(30);
  });
});
