import type { Bar, BarStrategy, SimContext } from './types.ts';

export const NOOP_V1: BarStrategy = {
  name: 'noop_v1',
  onBar: () => [],
};

type ReplayAwareStrategy = BarStrategy & {
  prepareReplay: (bars: ReadonlyArray<Bar>) => BarStrategy;
};

export const OPEN_HOLD_CLOSE_V1: ReplayAwareStrategy = {
  name: 'open_hold_close_v1',
  prepareReplay: createOpenHoldCloseStrategy,
  onBar: () => [],
};

function createOpenHoldCloseStrategy(bars: ReadonlyArray<Bar>): BarStrategy {
  const lastStartBySymbol = new Map<string, number>();
  for (const bar of bars) lastStartBySymbol.set(bar.symbol, bar.tsStart);

  let openedSymbol: string | null = null;
  return {
    name: OPEN_HOLD_CLOSE_V1.name,
    onBar(bar, ctx) {
      const openForSymbol = findOpenPosition(ctx, openedSymbol);
      if (
        openForSymbol &&
        bar.symbol === openedSymbol &&
        bar.tsStart === lastStartBySymbol.get(bar.symbol)
      ) {
        return [{ kind: 'close', positionId: openForSymbol.id }];
      }
      if (openedSymbol === null) {
        openedSymbol = bar.symbol;
        return [
          {
            kind: 'open',
            side: 'long',
            symbol: bar.symbol,
            sizeLots: 0.01,
            stopLoss: bar.close - Math.max(100, bar.close * 0.5),
          },
        ];
      }
      return [];
    },
  };
}

function findOpenPosition(ctx: SimContext, symbol: string | null) {
  if (symbol === null) return undefined;
  return ctx.openPositions.find((p) => p.symbol === symbol);
}
