import type { IMarketDataProvider } from '@ankit-prop/market-data';
import { backtest } from './backtest.ts';
import type { AccountConfig, Bar, BarStrategy, EvalResult, SymbolMeta } from './types.ts';

export type ReplayInput = {
  strategyVersion: string;
  account: AccountConfig;
  provider: IMarketDataProvider;
  symbols: ReadonlyArray<{ symbol: string; timeframe: string }>;
  window: { fromMs: number; toMs: number };
  symbolMetas: ReadonlyArray<SymbolMeta>;
  strategy: BarStrategy;
};

type ReplayPreparedStrategy = BarStrategy & {
  prepareReplay?: (bars: ReadonlyArray<Bar>) => BarStrategy;
};

export async function replayWithProvider(input: ReplayInput): Promise<EvalResult> {
  const barSets = await Promise.all(
    input.symbols.map(async (s) => ({
      symbol: s.symbol,
      timeframe: s.timeframe,
      bars: await input.provider.getBars({
        symbol: s.symbol,
        timeframe: s.timeframe,
        fromMs: input.window.fromMs,
        toMs: input.window.toMs,
      }),
    })),
  );
  const bars = mergeBars(barSets);
  const events =
    input.provider.getEvents === undefined
      ? []
      : await input.provider.getEvents({ fromMs: input.window.fromMs, toMs: input.window.toMs });
  const strategy = prepareStrategy(input.strategy, bars);

  return backtest({
    strategyVersion: input.strategyVersion,
    account: input.account,
    bars,
    symbols: input.symbolMetas,
    events,
    strategy,
  });
}

function mergeBars(
  barSets: ReadonlyArray<{
    symbol: string;
    timeframe: string;
    bars: readonly Bar[];
  }>,
): Bar[] {
  const cursors = barSets.map(() => 0);
  const merged: Bar[] = [];

  while (true) {
    let bestSet = -1;
    let bestBar: Bar | undefined;
    for (let i = 0; i < barSets.length; i++) {
      const candidate = barSets[i]?.bars[cursors[i] ?? 0];
      if (!candidate) continue;
      if (!bestBar || compareBars(candidate, bestBar) < 0) {
        bestSet = i;
        bestBar = candidate;
      }
    }
    if (!bestBar || bestSet === -1) return merged;
    merged.push(bestBar);
    cursors[bestSet] = (cursors[bestSet] ?? 0) + 1;
  }
}

function compareBars(a: Bar, b: Bar): number {
  return (
    a.tsStart - b.tsStart ||
    a.symbol.localeCompare(b.symbol) ||
    a.timeframe.localeCompare(b.timeframe)
  );
}

function prepareStrategy(strategy: BarStrategy, bars: ReadonlyArray<Bar>): BarStrategy {
  const replayAware = strategy as ReplayPreparedStrategy;
  return replayAware.prepareReplay?.(bars) ?? strategy;
}
