import type {
  AccountConfig,
  Bar,
  BarStrategy,
  CalendarEvent,
  StrategyAction,
  SymbolMeta,
} from '../types.ts';

export type GoldenFixture = {
  id: string;
  description: string;
  account: AccountConfig;
  symbols: SymbolMeta[];
  bars: Bar[];
  events: CalendarEvent[];
  strategy: BarStrategy;
  expects: {
    breachKinds: ReadonlyArray<string>;
    minTrades?: number;
    deterministicTrades?: number;
  };
};

const ONE_MIN_MS = 60_000;
const FIVE_MIN_MS = 5 * ONE_MIN_MS;

const XAU_META: SymbolMeta = {
  symbol: 'XAUUSD',
  pipSize: 0.1,
  contractSize: 100,
  typicalSpreadPips: 2,
};

const NAS_META: SymbolMeta = {
  symbol: 'NAS100',
  pipSize: 0.1,
  contractSize: 1,
  typicalSpreadPips: 1.5,
};

function genBars(
  symbol: string,
  startMs: number,
  count: number,
  closes: number[],
  timeframe = '5m',
): Bar[] {
  const bars: Bar[] = [];
  for (let i = 0; i < count; i++) {
    const close = closes[i] ?? closes[closes.length - 1] ?? 100;
    const prev = i === 0 ? close : (closes[i - 1] ?? close);
    bars.push({
      symbol,
      timeframe,
      tsStart: startMs + i * FIVE_MIN_MS,
      tsEnd: startMs + (i + 1) * FIVE_MIN_MS,
      open: prev,
      high: Math.max(prev, close) + 0.5,
      low: Math.min(prev, close) - 0.5,
      close,
      volume: 1000,
    });
  }
  return bars;
}

const baseAccount = (overrides: Partial<AccountConfig> = {}): AccountConfig => ({
  accountId: 'ftmo-trial-1',
  envelopeId: 'ftmo-trial-burn-in',
  initialCapital: 100_000,
  phase: 'phase_1',
  ...overrides,
});

export const FLAT_FIXTURE: GoldenFixture = {
  id: 'flat',
  description: 'HOLD-always strategy yields zero trades and zero breaches.',
  account: baseAccount(),
  symbols: [XAU_META],
  bars: genBars(
    'XAUUSD',
    Date.UTC(2026, 0, 5, 8, 0, 0),
    20,
    Array.from({ length: 20 }, (_, i) => 2050 + i * 0.1),
  ),
  events: [],
  strategy: {
    name: 'flat',
    onBar(): StrategyAction[] {
      return [];
    },
  },
  expects: {
    breachKinds: [],
    minTrades: 0,
    deterministicTrades: 0,
  },
};

export const TRIVIAL_FIXTURE: GoldenFixture = (() => {
  const startMs = Date.UTC(2026, 0, 5, 8, 0, 0);
  const closes = Array.from({ length: 12 }, (_, i) => 2050 + (i % 4) * 0.5);
  const bars = genBars('XAUUSD', startMs, 12, closes);
  return {
    id: 'trivial',
    description:
      'BUY at the first bar, exit at the next bar. 5-min hold beats min-hold; deterministic outcome.',
    account: baseAccount(),
    symbols: [XAU_META],
    bars,
    events: [],
    strategy: {
      name: 'trivial-buy-then-exit',
      onBar(bar, ctx): StrategyAction[] {
        if (ctx.openPositions.length === 0 && bar.tsStart === startMs) {
          return [
            {
              kind: 'open',
              side: 'long',
              symbol: 'XAUUSD',
              sizeLots: 0.1,
              stopLoss: bar.close - 5,
              takeProfit: bar.close + 5,
            },
          ];
        }
        if (ctx.openPositions.length > 0) {
          const pos = ctx.openPositions[0];
          if (pos && bar.tsStart === startMs + FIVE_MIN_MS) {
            return [{ kind: 'close', positionId: pos.id }];
          }
        }
        return [];
      },
    },
    expects: { breachKinds: [], minTrades: 1, deterministicTrades: 1 },
  };
})();

export const BAD_DAILY_LOSS_FIXTURE: GoldenFixture = (() => {
  const startMs = Date.UTC(2026, 0, 5, 8, 0, 0);
  const closes: number[] = [2050];
  for (let i = 1; i < 30; i++) closes.push((closes[i - 1] ?? 2050) - 5);
  const bars = genBars('XAUUSD', startMs, 30, closes);
  return {
    id: 'bad-daily-loss',
    description:
      'Massive long XAUUSD trade against a sustained decline; equity penetrates 4% internal floor.',
    account: baseAccount(),
    symbols: [XAU_META],
    bars,
    events: [],
    strategy: {
      name: 'force-daily-loss',
      onBar(bar, ctx): StrategyAction[] {
        if (ctx.openPositions.length === 0 && bar.tsStart === startMs) {
          return [
            {
              kind: 'open',
              side: 'long',
              symbol: 'XAUUSD',
              sizeLots: 50,
              stopLoss: bar.close - 1000,
            },
          ];
        }
        return [];
      },
    },
    expects: { breachKinds: ['daily_loss'] },
  };
})();

export const BAD_NEWS_WINDOW_FIXTURE: GoldenFixture = (() => {
  const startMs = Date.UTC(2026, 0, 5, 13, 25, 0);
  const closes = Array.from({ length: 12 }, (_, i) => 2050 + i * 0.2);
  const bars = genBars('XAUUSD', startMs, 12, closes);
  const eventTs = Date.UTC(2026, 0, 5, 13, 30, 0);
  return {
    id: 'bad-news-window',
    description: 'Strategy opens an XAUUSD trade inside the ±5-min restricted news window.',
    account: baseAccount(),
    symbols: [XAU_META],
    bars,
    events: [
      {
        id: 'NFP',
        timestamp: eventTs,
        symbols: ['XAUUSD'],
        impact: 'high',
        restricted: true,
      },
    ],
    strategy: {
      name: 'force-news-window-open',
      onBar(bar, ctx): StrategyAction[] {
        if (
          ctx.openPositions.length === 0 &&
          bar.tsStart >= eventTs - 4 * ONE_MIN_MS &&
          bar.tsStart <= eventTs + 4 * ONE_MIN_MS
        ) {
          return [
            {
              kind: 'open',
              side: 'long',
              symbol: 'XAUUSD',
              sizeLots: 0.1,
              stopLoss: bar.close - 5,
            },
          ];
        }
        return [];
      },
    },
    expects: { breachKinds: ['news_blackout_open'] },
  };
})();

export const BAD_MIN_HOLD_FIXTURE: GoldenFixture = (() => {
  const startMs = Date.UTC(2026, 0, 5, 8, 0, 0);
  const closes = Array.from({ length: 20 }, (_, i) => 2050 + i * 0.05);
  const bars: Bar[] = [];
  for (let i = 0; i < 20; i++) {
    const close = closes[i] ?? 2050;
    const prev = i === 0 ? close : (closes[i - 1] ?? close);
    bars.push({
      symbol: 'XAUUSD',
      timeframe: '1m',
      tsStart: startMs + i * 30_000,
      tsEnd: startMs + (i + 1) * 30_000,
      open: prev,
      high: Math.max(prev, close) + 0.3,
      low: Math.min(prev, close) - 0.3,
      close,
      volume: 100,
    });
  }
  return {
    id: 'bad-min-hold',
    description: 'Strategy opens and closes within 30 s — under the 60 s min-hold floor.',
    account: baseAccount(),
    symbols: [XAU_META],
    bars,
    events: [],
    strategy: {
      name: 'force-min-hold-violation',
      onBar(bar, ctx): StrategyAction[] {
        if (ctx.openPositions.length === 0 && bar.tsStart === startMs) {
          return [
            {
              kind: 'open',
              side: 'long',
              symbol: 'XAUUSD',
              sizeLots: 0.1,
              stopLoss: bar.close - 5,
            },
          ];
        }
        if (ctx.openPositions.length > 0) {
          const pos = ctx.openPositions[0];
          if (pos && bar.tsStart === startMs + 30_000) {
            return [{ kind: 'close', positionId: pos.id }];
          }
        }
        return [];
      },
    },
    expects: { breachKinds: ['min_hold'] },
  };
})();

export const BAD_WEEKEND_HOLD_FIXTURE: GoldenFixture = (() => {
  const fridayClose = Date.UTC(2026, 0, 9, 21, 0, 0);
  const startMs = fridayClose - 25 * FIVE_MIN_MS;
  const closes = Array.from({ length: 30 }, (_, i) => 2050 + i * 0.1);
  const bars = genBars('XAUUSD', startMs, 30, closes);
  return {
    id: 'bad-weekend-hold',
    description: 'Strategy holds an open position past Friday close.',
    account: baseAccount({ weekendCloseTimestamp: fridayClose }),
    symbols: [XAU_META],
    bars,
    events: [],
    strategy: {
      name: 'force-weekend-hold',
      onBar(bar, ctx): StrategyAction[] {
        if (ctx.openPositions.length === 0 && bar.tsStart === startMs) {
          return [
            {
              kind: 'open',
              side: 'long',
              symbol: 'XAUUSD',
              sizeLots: 0.1,
              stopLoss: bar.close - 5,
            },
          ];
        }
        return [];
      },
    },
    expects: { breachKinds: ['weekend_hold'] },
  };
})();

export const ALL_GOLDEN_FIXTURES: ReadonlyArray<GoldenFixture> = [
  FLAT_FIXTURE,
  TRIVIAL_FIXTURE,
  BAD_DAILY_LOSS_FIXTURE,
  BAD_NEWS_WINDOW_FIXTURE,
  BAD_MIN_HOLD_FIXTURE,
  BAD_WEEKEND_HOLD_FIXTURE,
];

void NAS_META;
