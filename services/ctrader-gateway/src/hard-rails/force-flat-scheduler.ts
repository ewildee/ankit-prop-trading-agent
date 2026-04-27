// Rail 13 — pre-flatten scheduler (BLUEPRINT §11.6, decision M.2).
// Tracks which open positions have already been enqueued for ProtoOAClosePositionReq
// so we don't double-enqueue across ticks.

import type { NewsClient, OpenPosition } from './types.ts';

export type FlattenReason = 'market_close' | 'friday_close' | 'pre_news_flatten';

export interface FlattenEnqueue {
  readonly positionId: string;
  readonly symbol: string;
  readonly reason: FlattenReason;
  readonly windowAtMs: number;
}

export interface FlattenTickInput {
  readonly nowMs: number;
  readonly symbol: string;
  readonly positions: readonly OpenPosition[];
  readonly forceFlatLeadMin: number;
  readonly preNewsFlattenLeadMin: number;
  readonly marketCloseAtMs?: number;
  readonly fridayCloseAtMs?: number;
  readonly news: NewsClient;
}

export class ForceFlatScheduler {
  private readonly enqueued = new Set<string>();
  private readonly events: FlattenEnqueue[] = [];

  // Returns positions newly enqueued on this tick (does NOT replay history).
  tick(input: FlattenTickInput): FlattenEnqueue[] {
    const fresh: FlattenEnqueue[] = [];
    const minute = 60 * 1000;
    const flatLeadMs = input.forceFlatLeadMin * minute;
    const preNewsLeadMs = input.preNewsFlattenLeadMin * minute;

    const nextRestricted = input.news.nextRestrictedEvent(input.symbol, input.nowMs);
    const candidates: { atMs: number; reason: FlattenReason }[] = [];
    if (input.marketCloseAtMs !== undefined && input.nowMs + flatLeadMs >= input.marketCloseAtMs) {
      candidates.push({ atMs: input.marketCloseAtMs, reason: 'market_close' });
    }
    if (input.fridayCloseAtMs !== undefined && input.nowMs + flatLeadMs >= input.fridayCloseAtMs) {
      candidates.push({ atMs: input.fridayCloseAtMs, reason: 'friday_close' });
    }
    if (nextRestricted !== null && input.nowMs + preNewsLeadMs >= nextRestricted.eventAtMs) {
      candidates.push({ atMs: nextRestricted.eventAtMs, reason: 'pre_news_flatten' });
    }
    if (candidates.length === 0) return fresh;
    const earliest = candidates.reduce((a, b) => (a.atMs <= b.atMs ? a : b));

    for (const pos of input.positions) {
      if (pos.symbol !== input.symbol) continue;
      if (this.enqueued.has(pos.positionId)) continue;
      const ev: FlattenEnqueue = {
        positionId: pos.positionId,
        symbol: pos.symbol,
        reason: earliest.reason,
        windowAtMs: earliest.atMs,
      };
      this.enqueued.add(pos.positionId);
      this.events.push(ev);
      fresh.push(ev);
    }
    return fresh;
  }

  isEnqueued(positionId: string): boolean {
    return this.enqueued.has(positionId);
  }

  history(): readonly FlattenEnqueue[] {
    return this.events;
  }
}

// Used by rail-13 evaluator: are we currently inside the no-new-entries window?
export function isInsideForceFlatWindow(input: {
  nowMs: number;
  forceFlatLeadMin: number;
  preNewsFlattenLeadMin: number;
  marketCloseAtMs?: number;
  fridayCloseAtMs?: number;
  nextRestrictedEventAtMs?: number;
}): { inside: boolean; reason?: string; windowAtMs?: number } {
  const minute = 60 * 1000;
  const flatLeadMs = input.forceFlatLeadMin * minute;
  const preNewsLeadMs = input.preNewsFlattenLeadMin * minute;
  if (input.marketCloseAtMs !== undefined && input.nowMs + flatLeadMs >= input.marketCloseAtMs) {
    return {
      inside: true,
      reason: `market-close in <= ${input.forceFlatLeadMin}m`,
      windowAtMs: input.marketCloseAtMs,
    };
  }
  if (input.fridayCloseAtMs !== undefined && input.nowMs + flatLeadMs >= input.fridayCloseAtMs) {
    return {
      inside: true,
      reason: `friday-close in <= ${input.forceFlatLeadMin}m`,
      windowAtMs: input.fridayCloseAtMs,
    };
  }
  if (
    input.nextRestrictedEventAtMs !== undefined &&
    input.nowMs + preNewsLeadMs >= input.nextRestrictedEventAtMs
  ) {
    return {
      inside: true,
      reason: `restricted-event in <= ${input.preNewsFlattenLeadMin}m`,
      windowAtMs: input.nextRestrictedEventAtMs,
    };
  }
  return { inside: false };
}
