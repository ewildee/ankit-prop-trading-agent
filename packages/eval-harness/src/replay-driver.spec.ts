import { describe, expect, test } from 'bun:test';
import { CachedFixtureProvider, MarketDataNotAvailable } from '@ankit-prop/market-data';
import { snapshotFromEvalResult } from './replay-cli.ts';
import { type ReplayInput, replayWithProvider } from './replay-driver.ts';
import { OPEN_HOLD_CLOSE_V1 } from './replay-strategies.ts';
import type { AccountConfig, Bar, BarStrategy, SymbolMeta } from './types.ts';

const FIXTURE_ROOT = 'data/market-data/twelvedata/v1.0.0-2026-04-28';
const WINDOW_TO_MS = Date.parse('2026-04-28T00:00:00.000Z');
const SMOKE_WINDOW = {
  fromMs: WINDOW_TO_MS - 7 * 24 * 60 * 60_000,
  toMs: WINDOW_TO_MS,
};

const ACCOUNT: AccountConfig = {
  accountId: 'fixture-replay-spec',
  envelopeId: null,
  initialCapital: 100_000,
  phase: 'phase_1',
};

const INSTRUMENT_SPECS = {
  XAUUSD: { pipSize: 0.01, contractSize: 100, typicalSpreadPips: 15 },
  NAS100: { pipSize: 0.1, contractSize: 1, typicalSpreadPips: 10 },
};

async function fixtureProvider(): Promise<CachedFixtureProvider> {
  return new CachedFixtureProvider({
    rootPath: FIXTURE_ROOT,
    instrumentSpecs: INSTRUMENT_SPECS,
  });
}

async function symbolMetas(
  provider: CachedFixtureProvider,
  symbols: ReadonlyArray<string>,
): Promise<SymbolMeta[]> {
  const bySymbol = new Map((await provider.listSymbols()).map((s) => [s.symbol, s]));
  return symbols.map((s) => {
    const meta = bySymbol.get(s);
    if (!meta) throw new Error(`missing test symbol meta: ${s}`);
    return meta;
  });
}

describe('replayWithProvider', () => {
  test('smoke replay is deterministic against committed XAUUSD fixture', async () => {
    const firstProvider = await fixtureProvider();
    const firstResult = await replayWithProvider({
      strategyVersion: OPEN_HOLD_CLOSE_V1.name,
      account: ACCOUNT,
      provider: firstProvider,
      symbols: [{ symbol: 'XAUUSD', timeframe: '5m' }],
      window: SMOKE_WINDOW,
      symbolMetas: await symbolMetas(firstProvider, ['XAUUSD']),
      strategy: OPEN_HOLD_CLOSE_V1,
    });
    const first = snapshotFromEvalResult({
      result: firstResult,
      strategyVersion: OPEN_HOLD_CLOSE_V1.name,
      fixtureVersion: 'v1.0.0-2026-04-28',
      windowFromMs: SMOKE_WINDOW.fromMs,
      windowToMs: SMOKE_WINDOW.toMs,
      symbolSet: 'xauusd_5m',
    });

    const secondProvider = await fixtureProvider();
    const secondResult = await replayWithProvider({
      strategyVersion: OPEN_HOLD_CLOSE_V1.name,
      account: ACCOUNT,
      provider: secondProvider,
      symbols: [{ symbol: 'XAUUSD', timeframe: '5m' }],
      window: SMOKE_WINDOW,
      symbolMetas: await symbolMetas(secondProvider, ['XAUUSD']),
      strategy: OPEN_HOLD_CLOSE_V1,
    });
    const second = snapshotFromEvalResult({
      result: secondResult,
      strategyVersion: OPEN_HOLD_CLOSE_V1.name,
      fixtureVersion: 'v1.0.0-2026-04-28',
      windowFromMs: SMOKE_WINDOW.fromMs,
      windowToMs: SMOKE_WINDOW.toMs,
      symbolSet: 'xauusd_5m',
    });

    expect(second.tradesHash).toBe(first.tradesHash);
    expect(second.breachesHash).toBe(first.breachesHash);
  });

  test('runs the synthetic strategy through FTMO simulator machinery', async () => {
    const provider = await fixtureProvider();
    const result = await replayWithProvider({
      strategyVersion: OPEN_HOLD_CLOSE_V1.name,
      account: ACCOUNT,
      provider,
      symbols: [{ symbol: 'XAUUSD', timeframe: '5m' }],
      window: SMOKE_WINDOW,
      symbolMetas: await symbolMetas(provider, ['XAUUSD']),
      strategy: OPEN_HOLD_CLOSE_V1,
    });

    expect(result.diagnostics.tradeCount).toBe(1);
    expect(result.diagnostics.replayedTrades).toBeArray();
    expect((result.diagnostics.replayedTrades as unknown[]).length).toBe(1);
    expect(result.ftmoBreaches).toBeArray();
  });

  test('type-level ReplayInput does not expose threshold calibration knobs', () => {
    const strategy: BarStrategy = { name: 'type-only', onBar: () => [] };
    const provider = new CachedFixtureProvider({
      rootPath: FIXTURE_ROOT,
      instrumentSpecs: INSTRUMENT_SPECS,
    });
    const input: ReplayInput = {
      strategyVersion: 'type-only',
      account: ACCOUNT,
      provider,
      symbols: [{ symbol: 'XAUUSD', timeframe: '5m' }],
      window: SMOKE_WINDOW,
      symbolMetas: [INSTRUMENT_SPECS.XAUUSD as SymbolMeta],
      strategy,
      // @ts-expect-error ReplayInput intentionally forbids FTMO/internal threshold calibration.
      ftmoMargins: {},
    };
    const input2: ReplayInput = {
      strategyVersion: 'type-only',
      account: ACCOUNT,
      provider,
      symbols: [{ symbol: 'XAUUSD', timeframe: '5m' }],
      window: SMOKE_WINDOW,
      symbolMetas: [INSTRUMENT_SPECS.XAUUSD as SymbolMeta],
      strategy,
      // @ts-expect-error ReplayInput intentionally forbids internal threshold calibration.
      internalMargins: {},
    };
    const input3: ReplayInput = {
      strategyVersion: 'type-only',
      account: ACCOUNT,
      provider,
      symbols: [{ symbol: 'XAUUSD', timeframe: '5m' }],
      window: SMOKE_WINDOW,
      symbolMetas: [INSTRUMENT_SPECS.XAUUSD as SymbolMeta],
      strategy,
      // @ts-expect-error ReplayInput intentionally forbids HFT threshold calibration.
      hftMinHoldShareThreshold: 0.1,
    };

    expect(input.strategyVersion).toBe('type-only');
    expect(input2.strategyVersion).toBe('type-only');
    expect(input3.strategyVersion).toBe('type-only');
  });

  test('merges multi-symbol bars by timestamp with stable symbol/timeframe ordering', async () => {
    const provider = await fixtureProvider();
    const seen: Bar[] = [];
    const strategy: BarStrategy = {
      name: 'record-bars',
      onBar(bar) {
        seen.push(bar);
        return [];
      },
    };

    await replayWithProvider({
      strategyVersion: 'record-bars',
      account: ACCOUNT,
      provider,
      symbols: [
        { symbol: 'XAUUSD', timeframe: '5m' },
        { symbol: 'NAS100', timeframe: '5m' },
      ],
      window: SMOKE_WINDOW,
      symbolMetas: await symbolMetas(provider, ['XAUUSD', 'NAS100']),
      strategy,
    });

    expect(seen.length).toBeGreaterThan(0);
    const lastByPair = new Map<string, number>();
    for (let i = 1; i < seen.length; i++) {
      const prev = seen[i - 1];
      const cur = seen[i];
      expect(prev).toBeDefined();
      expect(cur).toBeDefined();
      if (!prev || !cur) continue;
      expect(compareSeen(prev, cur)).toBeLessThanOrEqual(0);
    }
    for (const bar of seen) {
      const key = `${bar.symbol}/${bar.timeframe}`;
      const last = lastByPair.get(key);
      if (last !== undefined) expect(bar.tsStart).toBeGreaterThan(last);
      lastByPair.set(key, bar.tsStart);
    }
  });

  test('passes provider availability errors through', async () => {
    const provider = await fixtureProvider();
    await expect(
      replayWithProvider({
        strategyVersion: 'unknown-symbol',
        account: ACCOUNT,
        provider,
        symbols: [{ symbol: 'EURUSD', timeframe: '5m' }],
        window: SMOKE_WINDOW,
        symbolMetas: await symbolMetas(provider, ['XAUUSD']),
        strategy: { name: 'noop', onBar: () => [] },
      }),
    ).rejects.toThrow(MarketDataNotAvailable);
  });
});

function compareSeen(a: Bar, b: Bar): number {
  return (
    a.tsStart - b.tsStart ||
    a.symbol.localeCompare(b.symbol) ||
    a.timeframe.localeCompare(b.timeframe)
  );
}
