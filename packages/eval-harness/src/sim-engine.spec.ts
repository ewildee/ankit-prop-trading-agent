import { describe, expect, test } from 'bun:test';
import {
  FTMO_DEFAULT_LINE,
  FtmoSimulator,
  type FtmoSimulatorCfg,
  INTERNAL_DEFAULT_MARGINS,
} from './ftmo-rules.ts';
import { pragueDayStartFromMs, runBarSimulation } from './sim-engine.ts';
import type { Bar, BarStrategy, SymbolMeta } from './types.ts';

const SYMBOL: SymbolMeta = {
  symbol: 'XAUUSD',
  pipSize: 0.1,
  contractSize: 100,
  typicalSpreadPips: 3,
};

function cfg(): FtmoSimulatorCfg {
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
  };
}

function bar(tsStart: number, close: number): Bar {
  return {
    symbol: 'XAUUSD',
    timeframe: '5m',
    tsStart,
    tsEnd: tsStart + 5 * 60_000,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
  };
}

describe('sim engine FTMO day and balance accounting', () => {
  test('Prague day bucket rolls at 00:00 Europe/Prague, not 00:00 UTC', () => {
    const jan5Prague2330 = Date.UTC(2026, 0, 5, 22, 30, 0);
    const jan6Prague0030 = Date.UTC(2026, 0, 5, 23, 30, 0);
    const jan5Prague0030 = Date.UTC(2026, 0, 4, 23, 30, 0);
    const jan5Prague0130 = Date.UTC(2026, 0, 5, 0, 30, 0);

    expect(pragueDayStartFromMs(jan5Prague2330)).not.toBe(pragueDayStartFromMs(jan6Prague0030));
    expect(pragueDayStartFromMs(jan5Prague0030)).toBe(pragueDayStartFromMs(jan5Prague0130));
  });

  test('strategy-driven close actions update final balance with realized PnL', () => {
    const bars = [
      bar(Date.UTC(2026, 0, 5, 8, 0, 0), 2050),
      bar(Date.UTC(2026, 0, 5, 8, 5, 0), 2040),
    ];
    const strategy: BarStrategy = {
      name: 'open-then-strategy-close',
      onBar: (_bar, ctx) => {
        if (ctx.openPositions.length === 0) {
          return [
            {
              kind: 'open',
              side: 'long',
              symbol: 'XAUUSD',
              sizeLots: 0.1,
              stopLoss: 2030,
            },
          ];
        }
        return [{ kind: 'close', positionId: ctx.openPositions[0]?.id ?? 'missing' }];
      },
    };

    const run = runBarSimulation({
      strategy,
      initialCapital: 100_000,
      symbols: new Map([['XAUUSD', SYMBOL]]),
      bars,
      ftmoSimulator: new FtmoSimulator(cfg()),
      newsBlackout: () => false,
      preNewsBlackout: () => false,
      pragueDayStartFromMs,
    });

    expect(run.trades).toHaveLength(1);
    expect(run.trades[0]?.closeReason).toBe('strategy');
    expect(run.trades[0]?.realizedPnl).toBe(-100);
    expect(run.finalBalance).toBe(99_900);
  });
});
