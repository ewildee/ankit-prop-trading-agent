// Rail 13 — force-flat scheduler tracks enqueued positions and refuses to
// double-enqueue. Lead-min windows fire on the earliest of {market_close,
// friday_close, restricted_event}.

import { describe, expect, test } from 'bun:test';
import { ForceFlatScheduler, isInsideForceFlatWindow } from './force-flat-scheduler.ts';
import { InMemoryNewsClient } from './news-client.ts';
import type { OpenPosition } from './types.ts';

const NOW = Date.parse('2026-04-27T16:00:00Z');

function pos(positionId: string, openedAtMs = NOW - 60_000): OpenPosition {
  return {
    positionId,
    symbol: 'XAUUSD',
    side: 'BUY',
    volume: 1,
    entryPrice: 2400,
    stopLossPrice: 2399,
    openedAtMs,
  };
}

describe('isInsideForceFlatWindow', () => {
  test('outside all windows', () => {
    const r = isInsideForceFlatWindow({
      nowMs: NOW,
      forceFlatLeadMin: 5,
      preNewsFlattenLeadMin: 6,
    });
    expect(r.inside).toBe(false);
  });

  test('inside market-close lead window', () => {
    const r = isInsideForceFlatWindow({
      nowMs: NOW,
      forceFlatLeadMin: 5,
      preNewsFlattenLeadMin: 6,
      marketCloseAtMs: NOW + 3 * 60_000,
    });
    expect(r.inside).toBe(true);
    expect(r.reason).toMatch(/market-close/);
  });

  test('inside friday-close lead window', () => {
    const r = isInsideForceFlatWindow({
      nowMs: NOW,
      forceFlatLeadMin: 5,
      preNewsFlattenLeadMin: 6,
      fridayCloseAtMs: NOW + 4 * 60_000,
    });
    expect(r.inside).toBe(true);
    expect(r.reason).toMatch(/friday-close/);
  });

  test('inside pre-news lead window (decision M.2)', () => {
    const r = isInsideForceFlatWindow({
      nowMs: NOW,
      forceFlatLeadMin: 5,
      preNewsFlattenLeadMin: 6,
      nextRestrictedEventAtMs: NOW + 5 * 60_000,
    });
    expect(r.inside).toBe(true);
    expect(r.reason).toMatch(/restricted-event/);
  });
});

describe('ForceFlatScheduler', () => {
  test('enqueues each open position exactly once', () => {
    const sched = new ForceFlatScheduler();
    const news = new InMemoryNewsClient();
    const positions = [pos('p1'), pos('p2')];
    const fresh = sched.tick({
      nowMs: NOW,
      symbol: 'XAUUSD',
      positions,
      forceFlatLeadMin: 5,
      preNewsFlattenLeadMin: 6,
      marketCloseAtMs: NOW + 4 * 60_000,
      news,
    });
    expect(fresh.map((e) => e.positionId).sort()).toEqual(['p1', 'p2']);
    const second = sched.tick({
      nowMs: NOW + 1000,
      symbol: 'XAUUSD',
      positions,
      forceFlatLeadMin: 5,
      preNewsFlattenLeadMin: 6,
      marketCloseAtMs: NOW + 4 * 60_000,
      news,
    });
    expect(second).toEqual([]);
    expect(sched.history()).toHaveLength(2);
  });

  test('chooses the earliest applicable window when multiple overlap', () => {
    const news = new InMemoryNewsClient({
      events: [
        // Restricted event 4m out — earliest under preNewsLead 6m.
        { atMs: NOW + 4 * 60_000, symbol: 'XAUUSD', impact: 'high', restriction: true },
      ],
    });
    const sched = new ForceFlatScheduler();
    const fresh = sched.tick({
      nowMs: NOW,
      symbol: 'XAUUSD',
      positions: [pos('p1')],
      forceFlatLeadMin: 5,
      preNewsFlattenLeadMin: 6,
      marketCloseAtMs: NOW + 5 * 60_000, // also inside the 5m forceFlatLead window
      news,
    });
    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.reason).toBe('pre_news_flatten');
  });

  test('does not enqueue across symbols', () => {
    const sched = new ForceFlatScheduler();
    const news = new InMemoryNewsClient();
    const fresh = sched.tick({
      nowMs: NOW,
      symbol: 'NAS100',
      positions: [pos('p1')], // p1 is XAUUSD
      forceFlatLeadMin: 5,
      preNewsFlattenLeadMin: 6,
      marketCloseAtMs: NOW + 1 * 60_000,
      news,
    });
    expect(fresh).toEqual([]);
  });

  test('quiet outside all windows', () => {
    const sched = new ForceFlatScheduler();
    const news = new InMemoryNewsClient();
    const fresh = sched.tick({
      nowMs: NOW,
      symbol: 'XAUUSD',
      positions: [pos('p1')],
      forceFlatLeadMin: 5,
      preNewsFlattenLeadMin: 6,
      news,
    });
    expect(fresh).toEqual([]);
  });
});
