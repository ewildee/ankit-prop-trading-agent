// In-memory NewsClient used by rail tests and the force-flat scheduler
// fixture. Real svc:news client lands alongside ANKA-9.

import type { NewsClient } from './types.ts';

export interface NewsEvent {
  readonly atMs: number;
  readonly symbol: string;
  // Tier-1 (rail 4) when impact === 'high' OR restriction === true (decision Y).
  readonly impact: 'low' | 'medium' | 'high';
  readonly restriction: boolean;
}

export interface InMemoryNewsClientOptions {
  readonly events?: readonly NewsEvent[];
  // Wall-clock ms of the most recent successful calendar fetch. `null` models
  // "never fetched" (process just started; rails 3/4 fail-closed). Omitted →
  // `nowMs?.()` for fresh-now fixtures; omitted without a clock keeps the
  // legacy future sentinel, which now fails closed per BLUEPRINT §9/§11.7 and
  // AGENTS.md / BLUEPRINT §0.2. No trades > wrong trades.
  readonly lastSuccessfulFetchAtMs?: number | null;
  readonly nowMs?: () => number;
}

const FRESH_SENTINEL_MS = Number.MAX_SAFE_INTEGER;

export class InMemoryNewsClient implements NewsClient {
  private readonly events: NewsEvent[];
  private readonly lastFetchAtMs: number | null;
  private readonly nowMs: (() => number) | undefined;

  constructor(opts: InMemoryNewsClientOptions = {}) {
    this.events = [...(opts.events ?? [])].sort((a, b) => a.atMs - b.atMs);
    this.lastFetchAtMs =
      opts.lastSuccessfulFetchAtMs === undefined ? FRESH_SENTINEL_MS : opts.lastSuccessfulFetchAtMs;
    this.nowMs = opts.lastSuccessfulFetchAtMs === undefined ? opts.nowMs : undefined;
  }

  isInBlackout(symbol: string, atMs: number): { blocked: boolean; reason?: string } {
    const fiveMin = 5 * 60 * 1000;
    for (const e of this.events) {
      if (e.symbol !== symbol || !e.restriction) continue;
      if (atMs >= e.atMs - fiveMin && atMs <= e.atMs + fiveMin) {
        return { blocked: true, reason: `restricted-event @ ${new Date(e.atMs).toISOString()}` };
      }
    }
    return { blocked: false };
  }

  isInPreNewsKill(symbol: string, atMs: number): { blocked: boolean; reason?: string } {
    const twoHours = 2 * 60 * 60 * 1000;
    for (const e of this.events) {
      if (e.symbol !== symbol) continue;
      const tier1 = e.impact === 'high' || e.restriction;
      if (!tier1) continue;
      if (atMs >= e.atMs - twoHours && atMs <= e.atMs) {
        return { blocked: true, reason: `tier-1 event @ ${new Date(e.atMs).toISOString()}` };
      }
    }
    return { blocked: false };
  }

  nextRestrictedEvent(symbol: string, atMs: number): { eventAtMs: number } | null {
    for (const e of this.events) {
      if (e.symbol === symbol && e.restriction && e.atMs >= atMs) {
        return { eventAtMs: e.atMs };
      }
    }
    return null;
  }

  lastSuccessfulFetchAtMs(): number | null {
    return this.nowMs?.() ?? this.lastFetchAtMs;
  }
}
