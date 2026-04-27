// Rail 12 — token-bucket throttle persisted across restart.

import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryThrottleStore, SqliteThrottleStore } from './throttle-store.ts';

const WINDOW = 24 * 60 * 60 * 1000;

describe('InMemoryThrottleStore', () => {
  test('drains then refills monotonically over the window', () => {
    const t = new InMemoryThrottleStore();
    let consumed = 0;
    for (let i = 0; i < 1800; i++) {
      const r = t.consume({ accountId: 'a', atMs: 0, capacity: 1800, windowMs: WINDOW });
      if (r.allowed) consumed++;
    }
    expect(consumed).toBe(1800);
    const denied = t.consume({ accountId: 'a', atMs: 0, capacity: 1800, windowMs: WINDOW });
    expect(denied.allowed).toBe(false);
    // Half a window later → ~half capacity refilled.
    const later = t.consume({
      accountId: 'a',
      atMs: WINDOW / 2,
      capacity: 1800,
      windowMs: WINDOW,
    });
    expect(later.allowed).toBe(true);
    expect(later.remaining).toBeGreaterThan(800);
    expect(later.remaining).toBeLessThan(900);
  });

  test('per-account isolation — one account drained does not affect another', () => {
    const t = new InMemoryThrottleStore();
    for (let i = 0; i < 1800; i++) {
      t.consume({ accountId: 'a', atMs: 0, capacity: 1800, windowMs: WINDOW });
    }
    const b = t.consume({ accountId: 'b', atMs: 0, capacity: 1800, windowMs: WINDOW });
    expect(b.allowed).toBe(true);
  });
});

describe('SqliteThrottleStore', () => {
  test('preserves bucket consumption across reopen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rail-throttle-'));
    const path = join(dir, 'throttle.db');
    let remainingFirst: number | undefined;
    {
      const db = new Database(path);
      const t = new SqliteThrottleStore(db);
      for (let i = 0; i < 100; i++) {
        const r = t.consume({ accountId: 'acc', atMs: 0, capacity: 1800, windowMs: WINDOW });
        remainingFirst = r.remaining;
      }
      db.close();
    }
    expect(remainingFirst).toBe(1700);
    {
      const db = new Database(path);
      const t = new SqliteThrottleStore(db);
      // No time elapsed since close; bucket should still report ~1700.
      const r = t.consume({ accountId: 'acc', atMs: 0, capacity: 1800, windowMs: WINDOW });
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(1699);
      db.close();
    }
  });

  test('refills based on elapsed wall-clock since last persisted consumption', () => {
    const t = SqliteThrottleStore.openInMemory();
    for (let i = 0; i < 1800; i++) {
      t.consume({ accountId: 'a', atMs: 0, capacity: 1800, windowMs: WINDOW });
    }
    const denied = t.consume({ accountId: 'a', atMs: 0, capacity: 1800, windowMs: WINDOW });
    expect(denied.allowed).toBe(false);
    const refilled = t.consume({
      accountId: 'a',
      atMs: WINDOW,
      capacity: 1800,
      windowMs: WINDOW,
    });
    expect(refilled.allowed).toBe(true);
    // Fully refilled minus the one we just consumed.
    expect(refilled.remaining).toBe(1799);
  });
});
