// Rail 9 — `clientOrderId` (ULID) registry. Persisted across restart
// (BLUEPRINT §9 deliverable). bun:sqlite is the canonical persistence per §5.1.

import { Database } from 'bun:sqlite';
import type { IdempotencyStore } from './types.ts';

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly seen = new Map<string, number>();
  has(clientOrderId: string): boolean {
    return this.seen.has(clientOrderId);
  }
  record(clientOrderId: string, decidedAtMs: number): void {
    this.seen.set(clientOrderId, decidedAtMs);
  }
}

export class SqliteIdempotencyStore implements IdempotencyStore {
  private readonly hasStmt;
  private readonly recordStmt;

  constructor(private readonly db: Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS rail_idempotency (
        client_order_id TEXT PRIMARY KEY,
        decided_at_ms INTEGER NOT NULL
      );
    `);
    this.hasStmt = db.query<{ c: number }, [string]>(
      'SELECT COUNT(1) AS c FROM rail_idempotency WHERE client_order_id = ?',
    );
    this.recordStmt = db.query<unknown, [string, number]>(
      'INSERT OR IGNORE INTO rail_idempotency (client_order_id, decided_at_ms) VALUES (?, ?)',
    );
  }

  static openInMemory(): SqliteIdempotencyStore {
    return new SqliteIdempotencyStore(new Database(':memory:'));
  }

  has(clientOrderId: string): boolean {
    const row = this.hasStmt.get(clientOrderId);
    return (row?.c ?? 0) > 0;
  }

  record(clientOrderId: string, decidedAtMs: number): void {
    this.recordStmt.run(clientOrderId, decidedAtMs);
  }
}
