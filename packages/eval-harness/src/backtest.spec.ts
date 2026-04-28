import { describe, expect, test } from 'bun:test';
import { backtest } from './backtest.ts';
import type { AccountConfig, Bar, BarStrategy, CalendarEvent, SymbolMeta } from './types.ts';

const ACCOUNT: AccountConfig = {
  accountId: 'ftmo-trial-1',
  envelopeId: null,
  initialCapital: 100_000,
  phase: 'phase_1',
};

const SYMBOL: SymbolMeta = {
  symbol: 'XAUUSD',
  pipSize: 0.1,
  contractSize: 100,
  typicalSpreadPips: 3,
};

const EVENT_TS = Date.UTC(2026, 0, 5, 13, 30, 0);

function bar(overrides: Partial<Bar> = {}): Bar {
  return {
    symbol: 'XAUUSD',
    timeframe: '5m',
    tsStart: EVENT_TS - 90 * 60_000,
    tsEnd: EVENT_TS - 85 * 60_000,
    open: 2050,
    high: 2052,
    low: 2049,
    close: 2051,
    volume: 100,
    ...overrides,
  };
}

describe('backtest FTMO calendar semantics', () => {
  test('high-impact non-restricted events still create the 2h pre-news kill-switch window', () => {
    const event: CalendarEvent = {
      id: 'fomc-2026-01-05',
      timestamp: EVENT_TS,
      symbols: ['XAUUSD'],
      impact: 'high',
      restricted: false,
    };
    const strategy: BarStrategy = {
      name: 'opens-inside-high-impact-pre-news-window',
      onBar: () => [
        {
          kind: 'open',
          side: 'long',
          symbol: 'XAUUSD',
          sizeLots: 0.1,
          stopLoss: 2040,
        },
      ],
    };

    const result = backtest({
      strategyVersion: 'regression:high-impact-pre-news',
      account: ACCOUNT,
      bars: [bar()],
      symbols: [SYMBOL],
      events: [event],
      strategy,
    });

    expect(
      result.ftmoBreaches.some(
        (b) => b.kind === 'news_blackout_open' && b.detail['window'] === 'pre_news_2h',
      ),
    ).toBe(true);
  });
});
