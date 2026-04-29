import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CachedFixtureProvider } from './cached-fixture-provider.ts';
import {
  type AdversarialWindowsFile,
  type BarLine,
  FIXTURE_SCHEMA_VERSION,
  type Manifest,
  type ShardEntry,
  type SymbolMetaFile,
} from './fixture-schema.ts';
import type { IMarketDataProvider } from './provider.ts';
import { type InstrumentSpec, MarketDataNotAvailable } from './types.ts';

const FIVE_MIN_MS = 5 * 60_000;
const FIFTEEN_MIN_MS = 15 * 60_000;
const T0 = 1_700_000_000_000;

const XAUUSD_META: SymbolMetaFile = {
  symbol: 'XAUUSD',
  twelveDataAlias: 'XAU/USD',
  exchange: 'Physical Currency',
  instrumentType: 'Forex',
  currency: 'USD',
  timezone: 'UTC',
  sessionCalendar: 'forex-24x5',
  dstHandling: 'none',
  fetchedAt: '2026-04-28T10:00:00.000Z',
  rawSymbolSearch: { matches: [] },
};

const NAS100_META: SymbolMetaFile = {
  symbol: 'NAS100',
  twelveDataAlias: 'NDX',
  exchange: 'NASDAQ',
  instrumentType: 'Index',
  currency: 'USD',
  timezone: 'America/New_York',
  sessionCalendar: 'us-equity',
  dstHandling: 'observed',
  fetchedAt: '2026-04-28T10:00:00.000Z',
  rawSymbolSearch: { matches: [] },
};

const SPECS: Record<string, InstrumentSpec> = {
  XAUUSD: { pipSize: 0.1, contractSize: 100, typicalSpreadPips: 30 },
  NAS100: { pipSize: 0.1, contractSize: 1, typicalSpreadPips: 1 },
};

function mkBar(t: number, base: number): BarLine {
  return { t, o: base, h: base + 1, l: base - 1, c: base + 0.5, v: 100 };
}

function writeJsonl(path: string, rows: ReadonlyArray<BarLine>): void {
  const text = rows.map((r) => JSON.stringify(r)).join('\n');
  writeFileSync(path, Bun.gzipSync(new TextEncoder().encode(text)));
}

function shard(symbol: string, timeframe: string, bars: ReadonlyArray<BarLine>): ShardEntry {
  return {
    path: `bars/${symbol}/${timeframe}.jsonl.gz`,
    symbol,
    timeframe,
    barCount: bars.length,
    firstBarStart: bars.length > 0 ? (bars[0]?.t ?? null) : null,
    lastBarStart: bars.length > 0 ? (bars[bars.length - 1]?.t ?? null) : null,
    byteSizeCompressed: 1,
    sha256: 'placeholder',
  };
}

function buildFixture(root: string): {
  xauBars5m: BarLine[];
  xauBars15m: BarLine[];
  nasBars5m: BarLine[];
} {
  const xauBars5m: BarLine[] = Array.from({ length: 12 }, (_, i) =>
    mkBar(T0 + i * FIVE_MIN_MS, 2350 + i * 0.1),
  );
  const xauBars15m: BarLine[] = Array.from({ length: 4 }, (_, i) =>
    mkBar(T0 + i * FIFTEEN_MIN_MS, 2350 + i * 0.3),
  );
  // Deliberate gap at index 3 — exercises sparse / missing-bar handling.
  const nasBars5m: BarLine[] = [
    mkBar(T0, 18000),
    mkBar(T0 + FIVE_MIN_MS, 18001),
    mkBar(T0 + 2 * FIVE_MIN_MS, 18002),
    mkBar(T0 + 4 * FIVE_MIN_MS, 18004),
    mkBar(T0 + 5 * FIVE_MIN_MS, 18005),
    mkBar(T0 + 6 * FIVE_MIN_MS, 18006),
  ];

  mkdirSync(join(root, 'bars', 'XAUUSD'), { recursive: true });
  mkdirSync(join(root, 'bars', 'NAS100'), { recursive: true });
  mkdirSync(join(root, 'symbols'), { recursive: true });
  writeJsonl(join(root, 'bars', 'XAUUSD', '5m.jsonl.gz'), xauBars5m);
  writeJsonl(join(root, 'bars', 'XAUUSD', '15m.jsonl.gz'), xauBars15m);
  writeJsonl(join(root, 'bars', 'NAS100', '5m.jsonl.gz'), nasBars5m);
  writeFileSync(join(root, 'symbols', 'XAUUSD.meta.json'), JSON.stringify(XAUUSD_META));
  writeFileSync(join(root, 'symbols', 'NAS100.meta.json'), JSON.stringify(NAS100_META));

  const manifest: Manifest = {
    schemaVersion: FIXTURE_SCHEMA_VERSION,
    fixtureVersion: 'spec-v1',
    fetchProvider: 'twelvedata',
    fetchProviderTier: 'grow',
    fetchedAtStart: '2026-04-28T10:00:00.000Z',
    fetchedAtEnd: '2026-04-28T10:30:00.000Z',
    intraday: { from: '2026-01-28', to: '2026-04-28' },
    dailyTail: { from: '2025-10-28', to: '2026-04-28' },
    symbols: ['XAUUSD', 'NAS100'],
    timeframes: { intraday: ['5m', '15m'], daily: ['1d'] },
    shards: [
      shard('XAUUSD', '5m', xauBars5m),
      shard('XAUUSD', '15m', xauBars15m),
      shard('NAS100', '5m', nasBars5m),
    ],
    credits: { estimated: 100, spent: 100 },
    adversarialWindowsCount: 2,
    git: null,
  };
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));

  const adversarial: AdversarialWindowsFile = {
    schemaVersion: FIXTURE_SCHEMA_VERSION,
    curatedAt: '2026-04-28T10:00:00.000Z',
    source: 'manual-curated',
    windows: [
      {
        id: 'nfp-test',
        kind: 'news',
        category: 'NFP',
        startMs: T0 + 6 * FIVE_MIN_MS,
        endMs: T0 + 6 * FIVE_MIN_MS + 60 * 60_000,
        symbols: ['XAUUSD', 'NAS100'],
        impact: 'high',
      },
      {
        id: 'fomc-test',
        kind: 'news',
        category: 'FOMC',
        startMs: T0 + 100 * FIVE_MIN_MS,
        endMs: T0 + 100 * FIVE_MIN_MS + 60 * 60_000,
        symbols: ['XAUUSD'],
        impact: 'high',
      },
      {
        id: 'us-closure',
        kind: 'holiday',
        category: 'us-equity-closure',
        startMs: T0 + 200 * FIVE_MIN_MS,
        endMs: T0 + 200 * FIVE_MIN_MS + 24 * 60 * 60_000,
        symbols: ['NAS100'],
        impact: 'closure',
      },
    ],
  };
  writeFileSync(join(root, 'adversarial-windows.json'), JSON.stringify(adversarial));

  return { xauBars5m, xauBars15m, nasBars5m };
}

describe('CachedFixtureProvider', () => {
  let root: string;
  let provider: CachedFixtureProvider;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'market-data-fixture-'));
    buildFixture(root);
    provider = new CachedFixtureProvider({ rootPath: root, instrumentSpecs: SPECS });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('listSymbols composes broker specs with provider identity from <symbol>.meta.json', async () => {
    const symbols = await provider.listSymbols();
    expect(symbols.map((s) => s.symbol).sort()).toEqual(['NAS100', 'XAUUSD']);
    const xau = symbols.find((s) => s.symbol === 'XAUUSD');
    expect(xau?.providerSymbol).toBe('XAU/USD');
    expect(xau?.exchange).toBe('Physical Currency');
    expect(xau?.sessionTz).toBe('UTC');
    expect(xau?.pipSize).toBe(0.1);
    expect(xau?.contractSize).toBe(100);
    expect(xau?.typicalSpreadPips).toBe(30);
  });

  test('symbol-identity round-trip: every listed symbol resolves back to itself', async () => {
    const symbols = await provider.listSymbols();
    for (const s of symbols) {
      const round = await provider.resolveSymbol(s.symbol);
      expect(round?.symbol).toBe(s.symbol);
      expect(round?.providerSymbol).toBe(s.providerSymbol);
      expect(round?.pipSize).toBe(s.pipSize);
    }
  });

  test('resolveSymbol returns undefined for unknown identity', async () => {
    expect(await provider.resolveSymbol('EURUSD')).toBeUndefined();
  });

  test('listAvailability lists symbol/timeframe pairs from manifest shards', async () => {
    const avail = await provider.listAvailability();
    const xau = avail.find((a) => a.symbol === 'XAUUSD');
    const nas = avail.find((a) => a.symbol === 'NAS100');
    expect([...(xau?.timeframes ?? [])].sort()).toEqual(['15m', '5m']);
    expect([...(nas?.timeframes ?? [])]).toEqual(['5m']);
  });

  test('getBars returns the full fixture window in ascending order with derived tsEnd', async () => {
    const bars = await provider.getBars({
      symbol: 'XAUUSD',
      timeframe: '5m',
      fromMs: T0,
      toMs: T0 + 12 * FIVE_MIN_MS,
    });
    expect(bars).toHaveLength(12);
    for (let i = 1; i < bars.length; i++) {
      const prev = bars[i - 1];
      const cur = bars[i];
      if (!prev || !cur) throw new Error('test setup error');
      expect(cur.tsStart).toBeGreaterThan(prev.tsStart);
    }
    expect(bars[0]?.symbol).toBe('XAUUSD');
    expect(bars[0]?.timeframe).toBe('5m');
    expect(bars[0]?.tsEnd).toBe((bars[0]?.tsStart ?? 0) + FIVE_MIN_MS);
    expect(bars[0]?.open).toBe(2350);
  });

  test('getBars range query is half-open [fromMs, toMs)', async () => {
    const bars = await provider.getBars({
      symbol: 'XAUUSD',
      timeframe: '5m',
      fromMs: T0 + 2 * FIVE_MIN_MS,
      toMs: T0 + 5 * FIVE_MIN_MS,
    });
    expect(bars.map((b) => b.tsStart)).toEqual([
      T0 + 2 * FIVE_MIN_MS,
      T0 + 3 * FIVE_MIN_MS,
      T0 + 4 * FIVE_MIN_MS,
    ]);
  });

  test('getBars returns [] when window falls outside fixture range', async () => {
    const before = await provider.getBars({
      symbol: 'XAUUSD',
      timeframe: '5m',
      fromMs: T0 - 10 * FIVE_MIN_MS,
      toMs: T0 - FIVE_MIN_MS,
    });
    expect(before).toHaveLength(0);

    const after = await provider.getBars({
      symbol: 'XAUUSD',
      timeframe: '5m',
      fromMs: T0 + 100 * FIVE_MIN_MS,
      toMs: T0 + 200 * FIVE_MIN_MS,
    });
    expect(after).toHaveLength(0);
  });

  test('getBars returns [] when toMs <= fromMs (degenerate window)', async () => {
    const bars = await provider.getBars({
      symbol: 'XAUUSD',
      timeframe: '5m',
      fromMs: T0 + 5 * FIVE_MIN_MS,
      toMs: T0 + 5 * FIVE_MIN_MS,
    });
    expect(bars).toHaveLength(0);
  });

  test('getBars throws MarketDataNotAvailable for unknown symbol/timeframe pair', async () => {
    await expect(
      provider.getBars({ symbol: 'EURUSD', timeframe: '5m', fromMs: 0, toMs: 1 }),
    ).rejects.toBeInstanceOf(MarketDataNotAvailable);

    await expect(
      provider.getBars({ symbol: 'NAS100', timeframe: '15m', fromMs: 0, toMs: 1 }),
    ).rejects.toBeInstanceOf(MarketDataNotAvailable);
  });

  test('getBars handles missing-bar gaps as sparse output (no synthetic fill)', async () => {
    const bars = await provider.getBars({
      symbol: 'NAS100',
      timeframe: '5m',
      fromMs: T0 + 2 * FIVE_MIN_MS,
      toMs: T0 + 6 * FIVE_MIN_MS,
    });
    // Expect 3 of the 4 possible 5m slots inside the window — the slot at
    // index 3 was deliberately omitted from the fixture.
    expect(bars.map((b) => b.tsStart)).toEqual([
      T0 + 2 * FIVE_MIN_MS,
      T0 + 4 * FIVE_MIN_MS,
      T0 + 5 * FIVE_MIN_MS,
    ]);
  });

  test('multi-timeframe queries on the same symbol read the right shard file', async () => {
    const five = await provider.getBars({
      symbol: 'XAUUSD',
      timeframe: '5m',
      fromMs: T0,
      toMs: T0 + 12 * FIVE_MIN_MS,
    });
    const fifteen = await provider.getBars({
      symbol: 'XAUUSD',
      timeframe: '15m',
      fromMs: T0,
      toMs: T0 + 4 * FIFTEEN_MIN_MS,
    });
    expect(five).toHaveLength(12);
    expect(fifteen).toHaveLength(4);
    expect(five.every((b) => b.timeframe === '5m')).toBe(true);
    expect(fifteen.every((b) => b.timeframe === '15m')).toBe(true);
    expect(fifteen[0]?.tsEnd).toBe((fifteen[0]?.tsStart ?? 0) + FIFTEEN_MIN_MS);
  });

  test('getEvents projects pre-windowed AdversarialWindow → CalendarEvent at startMs', async () => {
    const inner = await provider.getEvents({ fromMs: T0, toMs: T0 + 50 * FIVE_MIN_MS });
    expect(inner.map((e) => e.id)).toEqual(['nfp-test']);
    expect(inner[0]?.timestamp).toBe(T0 + 6 * FIVE_MIN_MS);
    expect(inner[0]?.impact).toBe('high');
    expect(inner[0]?.restricted).toBe(true);

    const wider = await provider.getEvents({ fromMs: T0, toMs: T0 + 250 * FIVE_MIN_MS });
    expect(wider.map((e) => e.id).sort()).toEqual(['fomc-test', 'nfp-test', 'us-closure']);
    const closure = wider.find((e) => e.id === 'us-closure');
    expect(closure?.impact).toBe('high'); // closure → high
    expect(closure?.restricted).toBe(true); // closure → restricted
  });

  test('contract conformance: provider satisfies IMarketDataProvider', () => {
    const p: IMarketDataProvider = provider;
    expect(typeof p.listSymbols).toBe('function');
    expect(typeof p.resolveSymbol).toBe('function');
    expect(typeof p.listAvailability).toBe('function');
    expect(typeof p.getBars).toBe('function');
    expect(typeof p.getEvents).toBe('function');
  });

  test('symbols missing from instrumentSpecs return zeroed broker fields (loud at sim time)', async () => {
    const provider2 = new CachedFixtureProvider({ rootPath: root }); // no instrumentSpecs
    const xau = await provider2.resolveSymbol('XAUUSD');
    expect(xau?.providerSymbol).toBe('XAU/USD'); // identity still populated
    expect(xau?.pipSize).toBe(0); // broker spec absent → zeroed
    expect(xau?.contractSize).toBe(0);
  });
});

describe('CachedFixtureProvider — failure modes', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'market-data-bad-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('rejects unsupported schemaVersion', async () => {
    writeFileSync(
      join(root, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 999,
        fixtureVersion: 'x',
        fetchProvider: 'twelvedata',
        fetchProviderTier: 'grow',
        fetchedAtStart: '2026-04-28T10:00:00.000Z',
        fetchedAtEnd: '2026-04-28T10:00:00.000Z',
        intraday: { from: '2026-01-28', to: '2026-04-28' },
        dailyTail: { from: '2025-10-28', to: '2026-04-28' },
        symbols: ['XAUUSD'],
        timeframes: { intraday: ['5m'], daily: ['1d'] },
        shards: [],
        credits: { estimated: 0, spent: 0 },
        adversarialWindowsCount: 0,
        git: null,
      }),
    );
    const provider = new CachedFixtureProvider({ rootPath: root });
    await expect(provider.listSymbols()).rejects.toThrow();
  });

  test('rejects manifest symbol with no <symbol>.meta.json sibling', async () => {
    const manifest: Manifest = {
      schemaVersion: FIXTURE_SCHEMA_VERSION,
      fixtureVersion: 'x',
      fetchProvider: 'twelvedata',
      fetchProviderTier: 'grow',
      fetchedAtStart: '2026-04-28T10:00:00.000Z',
      fetchedAtEnd: '2026-04-28T10:00:00.000Z',
      intraday: { from: '2026-01-28', to: '2026-04-28' },
      dailyTail: { from: '2025-10-28', to: '2026-04-28' },
      symbols: ['XAUUSD', 'EURUSD'],
      timeframes: { intraday: ['5m'], daily: ['1d'] },
      shards: [],
      credits: { estimated: 0, spent: 0 },
      adversarialWindowsCount: 0,
      git: null,
    };
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
    mkdirSync(join(root, 'symbols'), { recursive: true });
    writeFileSync(join(root, 'symbols', 'XAUUSD.meta.json'), JSON.stringify(XAUUSD_META));
    // EURUSD.meta.json missing on purpose.
    const provider = new CachedFixtureProvider({ rootPath: root });
    await expect(provider.listSymbols()).rejects.toThrow(/EURUSD/);
  });

  test('rejects non-ascending bars in jsonl.gz', async () => {
    const manifest: Manifest = {
      schemaVersion: FIXTURE_SCHEMA_VERSION,
      fixtureVersion: 'x',
      fetchProvider: 'twelvedata',
      fetchProviderTier: 'grow',
      fetchedAtStart: '2026-04-28T10:00:00.000Z',
      fetchedAtEnd: '2026-04-28T10:00:00.000Z',
      intraday: { from: '2026-01-28', to: '2026-04-28' },
      dailyTail: { from: '2025-10-28', to: '2026-04-28' },
      symbols: ['XAUUSD'],
      timeframes: { intraday: ['5m'], daily: ['1d'] },
      shards: [
        {
          path: 'bars/XAUUSD/5m.jsonl.gz',
          symbol: 'XAUUSD',
          timeframe: '5m',
          barCount: 2,
          firstBarStart: T0,
          lastBarStart: T0 + FIVE_MIN_MS,
          byteSizeCompressed: 1,
          sha256: 'placeholder',
        },
      ],
      credits: { estimated: 0, spent: 0 },
      adversarialWindowsCount: 0,
      git: null,
    };
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
    mkdirSync(join(root, 'symbols'), { recursive: true });
    writeFileSync(join(root, 'symbols', 'XAUUSD.meta.json'), JSON.stringify(XAUUSD_META));
    mkdirSync(join(root, 'bars', 'XAUUSD'), { recursive: true });
    writeJsonl(join(root, 'bars', 'XAUUSD', '5m.jsonl.gz'), [
      mkBar(T0 + FIVE_MIN_MS, 2350),
      mkBar(T0, 2350),
    ]);
    const provider = new CachedFixtureProvider({ rootPath: root });
    await expect(
      provider.getBars({ symbol: 'XAUUSD', timeframe: '5m', fromMs: T0, toMs: T0 + 1_000_000 }),
    ).rejects.toThrow(/ascending/);
  });

  test('unknown timeframe in manifest shard is rejected at load time', async () => {
    const manifest: Manifest = {
      schemaVersion: FIXTURE_SCHEMA_VERSION,
      fixtureVersion: 'x',
      fetchProvider: 'twelvedata',
      fetchProviderTier: 'grow',
      fetchedAtStart: '2026-04-28T10:00:00.000Z',
      fetchedAtEnd: '2026-04-28T10:00:00.000Z',
      intraday: { from: '2026-01-28', to: '2026-04-28' },
      dailyTail: { from: '2025-10-28', to: '2026-04-28' },
      symbols: ['XAUUSD'],
      timeframes: { intraday: ['7m'], daily: ['1d'] },
      shards: [
        {
          path: 'bars/XAUUSD/7m.jsonl.gz',
          symbol: 'XAUUSD',
          timeframe: '7m',
          barCount: 1,
          firstBarStart: T0,
          lastBarStart: T0,
          byteSizeCompressed: 1,
          sha256: 'placeholder',
        },
      ],
      credits: { estimated: 0, spent: 0 },
      adversarialWindowsCount: 0,
      git: null,
    };
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
    mkdirSync(join(root, 'symbols'), { recursive: true });
    writeFileSync(join(root, 'symbols', 'XAUUSD.meta.json'), JSON.stringify(XAUUSD_META));
    mkdirSync(join(root, 'bars', 'XAUUSD'), { recursive: true });
    writeJsonl(join(root, 'bars', 'XAUUSD', '7m.jsonl.gz'), [mkBar(T0, 2350)]);
    const provider = new CachedFixtureProvider({ rootPath: root });
    await expect(
      provider.getBars({ symbol: 'XAUUSD', timeframe: '7m', fromMs: T0, toMs: T0 + 1 }),
    ).rejects.toThrow(/unknown timeframe/);
  });
});
