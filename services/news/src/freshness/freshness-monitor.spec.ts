import { describe, expect, test } from 'bun:test';

import { createFreshnessMonitor, type FreshnessMonitorDb, STALENESS_LIMIT_MS } from './index.ts';

const NOW = '2026-04-29T12:00:00.000Z';

class InMemoryFreshnessDb implements FreshnessMonitorDb {
  readonly #meta = new Map<string, string>();

  constructor(meta: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(meta)) {
      this.#meta.set(key, value);
    }
  }

  getMeta(key: 'last_fetch_at' | 'last_fetch_ok'): string | null {
    return this.#meta.get(key) ?? null;
  }
}

describe('freshness-monitor', () => {
  test('returns never_fetched when last_fetch_at is absent', () => {
    const monitor = createFreshnessMonitor({
      db: new InMemoryFreshnessDb(),
      clock: { nowUtc: () => NOW },
    });

    expect(monitor.currentSnapshot()).toEqual({
      ageSeconds: Number.POSITIVE_INFINITY,
      fresh: false,
      reason: 'never_fetched',
    });
  });

  test('returns fetch_unhealthy when the last fetch failed regardless of age', () => {
    const cases = [
      {
        name: 'recent failure',
        lastFetchAt: isoBefore(NOW, 60_000),
        ageSeconds: 60,
      },
      {
        name: 'old failure',
        lastFetchAt: isoBefore(NOW, STALENESS_LIMIT_MS + 1),
        ageSeconds: STALENESS_LIMIT_MS / 1_000 + 0.001,
      },
    ];

    for (const item of cases) {
      const monitor = createFreshnessMonitor({
        db: new InMemoryFreshnessDb({
          last_fetch_at: item.lastFetchAt,
          last_fetch_ok: '0',
        }),
        clock: { nowUtc: () => NOW },
      });

      expect(monitor.currentSnapshot()).toEqual({
        ageSeconds: item.ageSeconds,
        fresh: false,
        reason: 'fetch_unhealthy',
      });
    }
  });

  test('treats a healthy fetch older than 2h as stale_calendar', () => {
    const monitor = createFreshnessMonitor({
      db: new InMemoryFreshnessDb({
        last_fetch_at: isoBefore(NOW, STALENESS_LIMIT_MS + 1),
        last_fetch_ok: '1',
      }),
      clock: { nowUtc: () => NOW },
    });

    expect(monitor.currentSnapshot()).toEqual({
      ageSeconds: STALENESS_LIMIT_MS / 1_000 + 0.001,
      fresh: false,
      reason: 'stale_calendar',
    });
  });

  test('treats a healthy fetch at exactly 2h as fresh', () => {
    const monitor = createFreshnessMonitor({
      db: new InMemoryFreshnessDb({
        last_fetch_at: isoBefore(NOW, STALENESS_LIMIT_MS),
        last_fetch_ok: '1',
      }),
      clock: { nowUtc: () => NOW },
    });

    expect(monitor.currentSnapshot()).toEqual({
      ageSeconds: STALENESS_LIMIT_MS / 1_000,
      fresh: true,
      reason: 'fresh',
    });
  });

  test('returns fresh for a healthy fetch inside the 2h window', () => {
    const monitor = createFreshnessMonitor({
      db: new InMemoryFreshnessDb({
        last_fetch_at: isoBefore(NOW, 30 * 60 * 1_000),
        last_fetch_ok: '1',
      }),
      clock: { nowUtc: () => NOW },
    });

    expect(monitor.currentSnapshot()).toEqual({
      ageSeconds: 1_800,
      fresh: true,
      reason: 'fresh',
    });
  });

  test('clamps negative ageSeconds to zero when the fetch timestamp is in the future', () => {
    const monitor = createFreshnessMonitor({
      db: new InMemoryFreshnessDb({
        last_fetch_at: isoAfter(NOW, 60_000),
        last_fetch_ok: '1',
      }),
      clock: { nowUtc: () => NOW },
    });

    expect(monitor.currentSnapshot()).toEqual({
      ageSeconds: 0,
      fresh: true,
      reason: 'fresh',
    });
  });

  test('fails closed with a finite reason and infinite age for malformed fetch timestamps', () => {
    const monitor = createFreshnessMonitor({
      db: new InMemoryFreshnessDb({
        last_fetch_at: 'not-a-date',
        last_fetch_ok: '1',
      }),
      clock: { nowUtc: () => NOW },
    });

    expect(monitor.currentSnapshot()).toEqual({
      ageSeconds: Number.POSITIVE_INFINITY,
      fresh: false,
      reason: 'stale_calendar',
    });
  });
});

function isoBefore(nowUtc: string, offsetMs: number): string {
  return new Date(Date.parse(nowUtc) - offsetMs).toISOString();
}

function isoAfter(nowUtc: string, offsetMs: number): string {
  return new Date(Date.parse(nowUtc) + offsetMs).toISOString();
}
