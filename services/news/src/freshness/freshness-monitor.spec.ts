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
      lastFetchAtUtc: null,
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
        lastFetchAtUtc: item.lastFetchAt,
        reason: 'fetch_unhealthy',
      });
    }
  });

  test('returns fetch_unhealthy unless last_fetch_ok is explicitly healthy', () => {
    const cases: ReadonlyArray<{
      readonly name: string;
      readonly lastFetchOk: string | null;
    }> = [
      { name: 'missing marker', lastFetchOk: null },
      { name: 'empty marker', lastFetchOk: '' },
      { name: 'explicit failure', lastFetchOk: '0' },
      { name: 'true string', lastFetchOk: 'true' },
      { name: 'false string', lastFetchOk: 'false' },
      { name: 'yes string', lastFetchOk: 'yes' },
      { name: 'unknown unhealthy string', lastFetchOk: 'unhealthy' },
    ];

    for (const item of cases) {
      const lastFetchAt = isoBefore(NOW, 60_000);
      const meta: Record<string, string> = {
        last_fetch_at: lastFetchAt,
      };
      if (item.lastFetchOk !== null) {
        meta.last_fetch_ok = item.lastFetchOk;
      }

      const monitor = createFreshnessMonitor({
        db: new InMemoryFreshnessDb(meta),
        clock: { nowUtc: () => NOW },
      });

      expect(monitor.currentSnapshot()).toEqual({
        ageSeconds: 60,
        fresh: false,
        lastFetchAtUtc: lastFetchAt,
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
      lastFetchAtUtc: isoBefore(NOW, STALENESS_LIMIT_MS + 1),
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
      lastFetchAtUtc: isoBefore(NOW, STALENESS_LIMIT_MS),
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
      lastFetchAtUtc: isoBefore(NOW, 30 * 60 * 1_000),
      reason: 'fresh',
    });
  });

  test('fails closed when the fetch timestamp is in the future', () => {
    const monitor = createFreshnessMonitor({
      db: new InMemoryFreshnessDb({
        last_fetch_at: isoAfter(NOW, 60_000),
        last_fetch_ok: '1',
      }),
      clock: { nowUtc: () => NOW },
    });

    expect(monitor.currentSnapshot()).toEqual({
      ageSeconds: 0,
      fresh: false,
      lastFetchAtUtc: isoAfter(NOW, 60_000),
      reason: 'fetch_unhealthy',
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
      lastFetchAtUtc: 'not-a-date',
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
