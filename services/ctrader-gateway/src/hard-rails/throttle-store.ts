// Rail 12 — EA throttle. Per-account token bucket, persisted across restart.
// BLUEPRINT §9: 1,800/day per account. Continuous refill model so a process
// restart does not "reset" the bucket — refill is computed against the last
// known consumption timestamp.

import { Database } from 'bun:sqlite';
import type { ThrottleStore } from './types.ts';

interface BucketRow {
  account_id: string;
  tokens_x_1e6: number;
  last_refill_at_ms: number;
}

interface BucketState {
  tokens: number;
  lastRefillAtMs: number;
}

function refill(state: BucketState, atMs: number, capacity: number, windowMs: number): BucketState {
  const elapsed = Math.max(0, atMs - state.lastRefillAtMs);
  const refillRatePerMs = capacity / windowMs;
  const next = Math.min(capacity, state.tokens + elapsed * refillRatePerMs);
  return { tokens: next, lastRefillAtMs: atMs };
}

export class InMemoryThrottleStore implements ThrottleStore {
  private readonly buckets = new Map<string, BucketState>();

  consume(args: { accountId: string; atMs: number; capacity: number; windowMs: number }): {
    allowed: boolean;
    remaining: number;
  } {
    const { accountId, atMs, capacity, windowMs } = args;
    const prior = this.buckets.get(accountId) ?? { tokens: capacity, lastRefillAtMs: atMs };
    const refilled = refill(prior, atMs, capacity, windowMs);
    if (refilled.tokens >= 1) {
      const next = { tokens: refilled.tokens - 1, lastRefillAtMs: atMs };
      this.buckets.set(accountId, next);
      return { allowed: true, remaining: Math.floor(next.tokens) };
    }
    this.buckets.set(accountId, refilled);
    return { allowed: false, remaining: 0 };
  }
}

export class SqliteThrottleStore implements ThrottleStore {
  private readonly getStmt;
  private readonly upsertStmt;

  constructor(private readonly db: Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS rail_throttle (
        account_id TEXT PRIMARY KEY,
        tokens_x_1e6 INTEGER NOT NULL,
        last_refill_at_ms INTEGER NOT NULL
      );
    `);
    this.getStmt = db.query<BucketRow, [string]>(
      'SELECT * FROM rail_throttle WHERE account_id = ?',
    );
    this.upsertStmt = db.query<unknown, [string, number, number]>(`
      INSERT INTO rail_throttle (account_id, tokens_x_1e6, last_refill_at_ms)
      VALUES (?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        tokens_x_1e6 = excluded.tokens_x_1e6,
        last_refill_at_ms = excluded.last_refill_at_ms
    `);
  }

  static openInMemory(): SqliteThrottleStore {
    return new SqliteThrottleStore(new Database(':memory:'));
  }

  consume(args: { accountId: string; atMs: number; capacity: number; windowMs: number }): {
    allowed: boolean;
    remaining: number;
  } {
    const { accountId, atMs, capacity, windowMs } = args;
    const row = this.getStmt.get(accountId);
    const prior: BucketState = row
      ? { tokens: row.tokens_x_1e6 / 1e6, lastRefillAtMs: row.last_refill_at_ms }
      : { tokens: capacity, lastRefillAtMs: atMs };
    const refilled = refill(prior, atMs, capacity, windowMs);
    if (refilled.tokens >= 1) {
      const nextTokens = refilled.tokens - 1;
      this.upsertStmt.run(accountId, Math.round(nextTokens * 1e6), atMs);
      return { allowed: true, remaining: Math.floor(nextTokens) };
    }
    this.upsertStmt.run(accountId, Math.round(refilled.tokens * 1e6), atMs);
    return { allowed: false, remaining: 0 };
  }
}
