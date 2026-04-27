import { describe, expect, test } from 'bun:test';
import {
  buildBlackoutWindows,
  buildPreNewsWindows,
  FTMO_DEFAULT_LINE,
  FtmoSimulator,
  type FtmoSimulatorCfg,
  INTERNAL_DEFAULT_MARGINS,
} from './ftmo-rules.ts';
import type { ClosedTrade, SimPosition } from './types.ts';

function cfg(overrides: Partial<FtmoSimulatorCfg> = {}): FtmoSimulatorCfg {
  return {
    accountId: 'ftmo-trial-1',
    envelopeId: null,
    initialCapital: 100_000,
    ftmoMargins: FTMO_DEFAULT_LINE,
    internalMargins: INTERNAL_DEFAULT_MARGINS,
    symbols: new Map([['XAUUSD', { pipSize: 0.1, contractSize: 100 }]]),
    newsBlackoutWindows: [],
    preNewsBlackoutWindows: [],
    weekendCloseTimestampsMs: [],
    hftMinHoldShareThreshold: 0.05,
    consistencyMaxShare: 0.45,
    consistencyCheckEnabled: false,
    consistencyMinTrades: 10,
    ...overrides,
  };
}

const trade = (overrides: Partial<ClosedTrade> = {}): ClosedTrade => ({
  id: 't1',
  symbol: 'XAUUSD',
  side: 'long',
  sizeLots: 0.1,
  openedAt: Date.UTC(2026, 0, 5, 8, 0, 0),
  closedAt: Date.UTC(2026, 0, 5, 8, 5, 0),
  openPrice: 2050,
  closePrice: 2055,
  realizedPnl: 50,
  initialRisk: 100,
  rMultiple: 0.5,
  closeReason: 'tp',
  ...overrides,
});

describe('FtmoSimulator', () => {
  test('daily loss internal floor fires before FTMO floor', () => {
    const sim = new FtmoSimulator(cfg());
    sim.setInitialDay(Date.UTC(2026, 0, 5, 0, 0, 0), 100_000);
    sim.onEquity(Date.UTC(2026, 0, 5, 12, 0, 0), 95_500);
    const breaches = sim.getBreaches();
    expect(breaches.some((b) => b.kind === 'daily_loss' && b.scope === 'internal')).toBe(true);
    expect(breaches.some((b) => b.kind === 'daily_loss' && b.scope === 'ftmo')).toBe(false);
  });

  test('crossing FTMO daily floor records both internal and FTMO breaches', () => {
    const sim = new FtmoSimulator(cfg());
    sim.setInitialDay(Date.UTC(2026, 0, 5, 0, 0, 0), 100_000);
    sim.onEquity(Date.UTC(2026, 0, 5, 12, 0, 0), 94_000);
    const kinds = sim
      .getBreaches()
      .filter((b) => b.kind === 'daily_loss')
      .map((b) => b.scope);
    expect(kinds).toContain('internal');
    expect(kinds).toContain('ftmo');
  });

  test('overall floor uses initial capital and ignores intra-day equity gains', () => {
    const sim = new FtmoSimulator(cfg());
    sim.setInitialDay(Date.UTC(2026, 0, 5, 0, 0, 0), 100_000);
    sim.onEquity(Date.UTC(2026, 0, 5, 13, 0, 0), 91_500);
    expect(sim.getBreaches().some((b) => b.kind === 'overall_loss' && b.scope === 'internal')).toBe(
      true,
    );
  });

  test('news blackout entry fires news_blackout_open', () => {
    const eventTs = Date.UTC(2026, 0, 5, 13, 30, 0);
    const sim = new FtmoSimulator(
      cfg({
        newsBlackoutWindows: buildBlackoutWindows(
          [{ tsMs: eventTs, symbols: ['XAUUSD'], restricted: true }],
          5 * 60_000,
        ).map((w) => ({ symbols: new Set(w.symbols), startMs: w.startMs, endMs: w.endMs })),
      }),
    );
    sim.setInitialDay(eventTs - 60_000, 100_000);
    const pos: SimPosition = {
      id: 'p1',
      symbol: 'XAUUSD',
      side: 'long',
      sizeLots: 0.1,
      openedAt: eventTs - 60_000,
      openPrice: 2050,
      stopLoss: 2045,
    };
    sim.onTradeOpen(eventTs - 60_000, pos);
    expect(sim.getBreaches().some((b) => b.kind === 'news_blackout_open')).toBe(true);
  });

  test('pre-news 2-h window blocks entries', () => {
    const eventTs = Date.UTC(2026, 0, 5, 13, 30, 0);
    const sim = new FtmoSimulator(
      cfg({
        preNewsBlackoutWindows: buildPreNewsWindows(
          [{ tsMs: eventTs, symbols: ['XAUUSD'], restricted: true }],
          INTERNAL_DEFAULT_MARGINS.preNewsBlackoutMs,
        ).map((w) => ({ symbols: new Set(w.symbols), startMs: w.startMs, endMs: w.endMs })),
      }),
    );
    sim.setInitialDay(eventTs - 90 * 60_000, 100_000);
    const pos: SimPosition = {
      id: 'p1',
      symbol: 'XAUUSD',
      side: 'long',
      sizeLots: 0.1,
      openedAt: eventTs - 90 * 60_000,
      openPrice: 2050,
      stopLoss: 2045,
    };
    sim.onTradeOpen(eventTs - 90 * 60_000, pos);
    expect(
      sim
        .getBreaches()
        .some((b) => b.kind === 'news_blackout_open' && b.detail['window'] === 'pre_news_2h'),
    ).toBe(true);
  });

  test('min-hold fires for sub-60s holds', () => {
    const sim = new FtmoSimulator(cfg());
    sim.setInitialDay(Date.UTC(2026, 0, 5, 8, 0, 0), 100_000);
    sim.onTradeClose(
      Date.UTC(2026, 0, 5, 8, 0, 30),
      trade({
        openedAt: Date.UTC(2026, 0, 5, 8, 0, 0),
        closedAt: Date.UTC(2026, 0, 5, 8, 0, 30),
      }),
    );
    expect(sim.getBreaches().some((b) => b.kind === 'min_hold')).toBe(true);
  });

  test('EA throttle exceeds at request 1801', () => {
    const sim = new FtmoSimulator(cfg());
    sim.setInitialDay(Date.UTC(2026, 0, 5, 0, 0, 0), 100_000);
    for (let i = 0; i < 1801; i++) {
      sim.recordEaRequest(Date.UTC(2026, 0, 5, 8, 0, 0) + i);
    }
    expect(sim.getBreaches().some((b) => b.kind === 'ea_throttle_exceeded')).toBe(true);
  });

  test('weekend_hold fires only on configured Friday-close ts', () => {
    const fridayClose = Date.UTC(2026, 0, 9, 21, 0, 0);
    const sim = new FtmoSimulator(cfg({ weekendCloseTimestampsMs: [fridayClose] }));
    sim.setInitialDay(fridayClose - 3600_000, 100_000);
    sim.checkWeekend(fridayClose, [
      {
        id: 'p1',
        symbol: 'XAUUSD',
        side: 'long',
        sizeLots: 0.1,
        openedAt: fridayClose - 60_000,
        openPrice: 2050,
        stopLoss: 2045,
      },
    ]);
    expect(sim.getBreaches().some((b) => b.kind === 'weekend_hold')).toBe(true);
  });

  test('consistency_violation fires when one day > 45% of total profit (funded only)', () => {
    const sim = new FtmoSimulator(cfg({ consistencyCheckEnabled: true, consistencyMinTrades: 2 }));
    const day1 = Date.UTC(2026, 0, 5, 8, 0, 0);
    const day2 = Date.UTC(2026, 0, 6, 8, 0, 0);
    sim.setInitialDay(day1, 100_000);
    sim.onTradeClose(day1, trade({ id: 't1', closedAt: day1, realizedPnl: 5_000 }));
    sim.onTradeClose(day2, trade({ id: 't2', closedAt: day2, realizedPnl: 1_000 }));
    sim.finalize([
      trade({ id: 't1', closedAt: day1, realizedPnl: 5_000 }),
      trade({ id: 't2', closedAt: day2, realizedPnl: 1_000 }),
    ]);
    expect(sim.getBreaches().some((b) => b.kind === 'consistency_violation')).toBe(true);
  });

  test('consistency_violation does NOT fire on phase 1/2 (default disabled)', () => {
    const sim = new FtmoSimulator(cfg());
    const day1 = Date.UTC(2026, 0, 5, 8, 0, 0);
    sim.setInitialDay(day1, 100_000);
    sim.onTradeClose(day1, trade({ id: 't1', closedAt: day1, realizedPnl: 5_000 }));
    sim.finalize([trade({ id: 't1', closedAt: day1, realizedPnl: 5_000 })]);
    expect(sim.getBreaches().some((b) => b.kind === 'consistency_violation')).toBe(false);
  });
});
