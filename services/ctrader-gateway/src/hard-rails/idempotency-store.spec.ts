// Rail 9 — idempotency persistence across process restart.

import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemoryIdempotencyStore, SqliteIdempotencyStore } from './idempotency-store.ts';

describe('InMemoryIdempotencyStore', () => {
  test('records and reports duplicates', () => {
    const s = new InMemoryIdempotencyStore();
    expect(s.has('a')).toBe(false);
    s.record('a', 1);
    expect(s.has('a')).toBe(true);
  });
});

describe('SqliteIdempotencyStore', () => {
  test('survives reopening the database (process-restart equivalent)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rail-idempotency-'));
    const path = join(dir, 'idempotency.db');
    {
      const db = new Database(path);
      const s = new SqliteIdempotencyStore(db);
      s.record('01J0XYZ-A', 1);
      s.record('01J0XYZ-B', 2);
      db.close();
    }
    {
      const db = new Database(path);
      const s = new SqliteIdempotencyStore(db);
      expect(s.has('01J0XYZ-A')).toBe(true);
      expect(s.has('01J0XYZ-B')).toBe(true);
      expect(s.has('01J0XYZ-C')).toBe(false);
      db.close();
    }
  });

  test('record is idempotent (duplicate insert does not throw)', () => {
    const s = SqliteIdempotencyStore.openInMemory();
    s.record('x', 1);
    expect(() => s.record('x', 2)).not.toThrow();
    expect(s.has('x')).toBe(true);
  });
});
