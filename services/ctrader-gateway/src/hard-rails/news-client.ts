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
  // Age (ms) reported by lastFetchAgeMs(); fixed for deterministic tests.
  readonly lastFetchAgeMs?: number;
}

export class InMemoryNewsClient implements NewsClient {
  private readonly events: NewsEvent[];
  private readonly fetchAge: number;

  constructor(opts: InMemoryNewsClientOptions = {}) {
    this.events = [...(opts.events ?? [])].sort((a, b) => a.atMs - b.atMs);
    this.fetchAge = opts.lastFetchAgeMs ?? 0;
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

  lastFetchAgeMs(): number {
    return this.fetchAge;
  }
}
