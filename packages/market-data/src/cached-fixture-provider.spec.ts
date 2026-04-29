import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBlackoutWindows, buildPreNewsWindows } from '../../eval-harness/src/ftmo-rules.ts';
import { CachedFixtureProvider } from './cached-fixture-provider.ts';
import {
  type AdversarialWindowsFile,
  AdversarialWindowsFileSchema,
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
const BOGUS_DISK_TS_END = T0 + 999 * FIVE_MIN_MS;
const REAL_FIXTURE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'data',
  'market-data',
  'twelvedata',
  'v1.0.0-2026-04-28',
);

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

function writeJsonl(
  path: string,
  rows: ReadonlyArray<BarLine>,
): {
  byteSizeCompressed: number;
  sha256: string;
} {
  const text = rows.map((r) => JSON.stringify(r)).join('\n');
  const compressed = Bun.gzipSync(new TextEncoder().encode(text));
  writeFileSync(path, compressed);
  return {
    byteSizeCompressed: compressed.length,
    sha256: new Bun.CryptoHasher('sha256').update(compressed).digest('hex'),
  };
}

function shard(
  symbol: string,
  timeframe: string,
  bars: ReadonlyArray<BarLine>,
  integrity: { byteSizeCompressed: number; sha256: string },
): ShardEntry {
  return {
    path: `bars/${symbol}/${timeframe}.jsonl.gz`,
    symbol,
    timeframe,
    barCount: bars.length,
    firstBarStart: bars.length > 0 ? (bars[0]?.t ?? null) : null,
    lastBarStart: bars.length > 0 ? (bars[bars.length - 1]?.t ?? null) : null,
    byteSizeCompressed: integrity.byteSizeCompressed,
    sha256: integrity.sha256,
  };
}

function readManifest(root: string): Manifest {
  return JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as Manifest;
}

function writeManifest(root: string, manifest: Manifest): void {
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
}

function mutateManifest(root: string, mutate: (manifest: Manifest) => void): void {
  const manifest = readManifest(root);
  mutate(manifest);
  writeManifest(root, manifest);
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
  const xauBars5mOnDisk = xauBars5m.map((bar, i) =>
    i === 0 ? { ...bar, tsEnd: BOGUS_DISK_TS_END } : bar,
  );
  const xau5m = writeJsonl(join(root, 'bars', 'XAUUSD', '5m.jsonl.gz'), xauBars5mOnDisk);
  const xau15m = writeJsonl(join(root, 'bars', 'XAUUSD', '15m.jsonl.gz'), xauBars15m);
  const nas5m = writeJsonl(join(root, 'bars', 'NAS100', '5m.jsonl.gz'), nasBars5m);
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
      shard('XAUUSD', '5m', xauBars5m, xau5m),
      shard('XAUUSD', '15m', xauBars15m, xau15m),
      shard('NAS100', '5m', nasBars5m, nas5m),
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
        eventTsMs: T0 + 6 * FIVE_MIN_MS + 30 * 60_000,
        symbols: ['XAUUSD', 'NAS100'],
        impact: 'high',
      },
      {
        id: 'fomc-test',
        kind: 'news',
        category: 'FOMC',
        startMs: T0 + 100 * FIVE_MIN_MS,
        endMs: T0 + 100 * FIVE_MIN_MS + 60 * 60_000,
        eventTsMs: T0 + 100 * FIVE_MIN_MS + 30 * 60_000,
        symbols: ['XAUUSD'],
        impact: 'high',
      },
      {
        id: 'us-closure',
        kind: 'holiday',
        category: 'us-equity-closure',
        startMs: T0 + 200 * FIVE_MIN_MS,
        endMs: T0 + 200 * FIVE_MIN_MS + 24 * 60 * 60_000,
        eventTsMs: T0 + 200 * FIVE_MIN_MS,
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
    expect(avail.find((a) => a.symbol === 'EURUSD')).toBeUndefined();
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
    expect(bars[0]?.tsEnd).not.toBe(BOGUS_DISK_TS_END);
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

  test('getEvents projects pre-windowed AdversarialWindow → CalendarEvent at eventTsMs', async () => {
    const inner = await provider.getEvents({ fromMs: T0, toMs: T0 + 50 * FIVE_MIN_MS });
    expect(inner.map((e) => e.id)).toEqual(['nfp-test']);
    expect(inner[0]?.timestamp).toBe(T0 + 6 * FIVE_MIN_MS + 30 * 60_000);
    expect(inner[0]?.impact).toBe('high');
    expect(inner[0]?.restricted).toBe(true);

    const wider = await provider.getEvents({ fromMs: T0, toMs: T0 + 250 * FIVE_MIN_MS });
    expect(wider.map((e) => e.id).sort()).toEqual(['fomc-test', 'nfp-test', 'us-closure']);
    const closure = wider.find((e) => e.id === 'us-closure');
    expect(closure?.timestamp).toBe(T0 + 200 * FIVE_MIN_MS);
    expect(closure?.impact).toBe('high'); // closure → high
    expect(closure?.restricted).toBe(true); // closure → restricted
  });

  test('real fixture news events project from eventTsMs before eval-harness re-windowing', async () => {
    const provider2 = new CachedFixtureProvider({
      rootPath: REAL_FIXTURE_ROOT,
      instrumentSpecs: SPECS,
    });
    const events = await provider2.getEvents({
      fromMs: Date.parse('2026-03-01T00:00:00Z'),
      toMs: Date.parse('2026-04-04T00:00:00Z'),
    });

    const assertWindows = (
      id: string,
      tsMs: number,
      blackoutStart: number,
      blackoutEnd: number,
    ) => {
      const event = events.find((e) => e.id === id);
      expect(event?.timestamp).toBe(tsMs);
      if (!event) throw new Error(`missing fixture event ${id}`);
      const input = {
        tsMs: event.timestamp,
        symbols: event.symbols,
        restricted: event.restricted,
        impact: event.impact,
      };
      expect(buildBlackoutWindows([input], 5 * 60_000)).toEqual([
        { symbols: new Set(event.symbols), startMs: blackoutStart, endMs: blackoutEnd },
      ]);
      expect(buildPreNewsWindows([input], 120 * 60_000)).toEqual([
        { symbols: new Set(event.symbols), startMs: tsMs - 120 * 60_000, endMs: tsMs },
      ]);
    };

    assertWindows(
      'nfp-2026-04-03',
      Date.parse('2026-04-03T13:30:00Z'),
      Date.parse('2026-04-03T13:25:00Z'),
      Date.parse('2026-04-03T13:35:00Z'),
    );
    assertWindows(
      'fomc-2026-03-18',
      Date.parse('2026-03-18T18:00:00Z'),
      Date.parse('2026-03-18T17:55:00Z'),
      Date.parse('2026-03-18T18:05:00Z'),
    );
    assertWindows(
      'ecb-2026-03-12',
      Date.parse('2026-03-12T13:15:00Z'),
      Date.parse('2026-03-12T13:10:00Z'),
      Date.parse('2026-03-12T13:20:00Z'),
    );

    const closure = events.find((e) => e.id === 'us-good-friday-2026');
    expect(closure?.timestamp).toBe(Date.parse('2026-04-03T00:00:00Z'));
    expect(closure?.restricted).toBe(true);
    expect(closure?.impact).toBe('high');
  });

  test('real fixture getEvents filters news by eventTsMs, not pre-window startMs', async () => {
    const provider2 = new CachedFixtureProvider({
      rootPath: REAL_FIXTURE_ROOT,
      instrumentSpecs: SPECS,
    });
    const events = await provider2.getEvents({
      fromMs: Date.parse('2026-04-03T13:25:00Z'),
      toMs: Date.parse('2026-04-03T13:35:00Z'),
    });

    expect(events.map((e) => e.id)).toContain('nfp-2026-04-03');
    const event = events.find((e) => e.id === 'nfp-2026-04-03');
    if (!event) throw new Error('missing fixture event nfp-2026-04-03');
    expect(event.timestamp).toBe(Date.parse('2026-04-03T13:30:00Z'));

    const eventInput = {
      tsMs: event.timestamp,
      symbols: event.symbols,
      restricted: event.restricted,
      impact: event.impact,
    };
    expect(buildBlackoutWindows([eventInput], 5 * 60_000)).toEqual([
      {
        symbols: new Set(event.symbols),
        startMs: Date.parse('2026-04-03T13:25:00Z'),
        endMs: Date.parse('2026-04-03T13:35:00Z'),
      },
    ]);
    expect(buildPreNewsWindows([eventInput], 120 * 60_000)).toEqual([
      {
        symbols: new Set(event.symbols),
        startMs: Date.parse('2026-04-03T11:30:00Z'),
        endMs: Date.parse('2026-04-03T13:30:00Z'),
      },
    ]);

    const preWindowOnly = await provider2.getEvents({
      fromMs: Date.parse('2026-04-03T13:00:00Z'),
      toMs: Date.parse('2026-04-03T13:25:00Z'),
    });
    expect(preWindowOnly.map((e) => e.id)).not.toContain('nfp-2026-04-03');
  });

  test('real fixture bar shard passes manifest integrity validation and loads unchanged', async () => {
    const provider2 = new CachedFixtureProvider({
      rootPath: REAL_FIXTURE_ROOT,
      instrumentSpecs: SPECS,
    });
    const bars = await provider2.getBars({
      symbol: 'XAUUSD',
      timeframe: '5m',
      fromMs: 1_769_558_400_000,
      toMs: 1_777_334_100_000 + FIVE_MIN_MS,
    });
    expect(bars).toHaveLength(25_901);
    expect(bars[0]?.tsStart).toBe(1_769_558_400_000);
    expect(bars.at(-1)?.tsStart).toBe(1_777_334_100_000);
  });

  test('AdversarialWindowsFileSchema rejects windows missing eventTsMs', () => {
    const parsed = AdversarialWindowsFileSchema.safeParse({
      schemaVersion: FIXTURE_SCHEMA_VERSION,
      curatedAt: '2026-04-28',
      source: 'manual-curated',
      windows: [
        {
          id: 'nfp-missing-event-ts',
          kind: 'news',
          category: 'NFP',
          startMs: T0,
          endMs: T0 + 60 * 60_000,
          symbols: ['XAUUSD'],
          impact: 'high',
        },
      ],
    });
    expect(parsed.success).toBe(false);
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
    expect(xau?.typicalSpreadPips).toBe(0);
  });

  test('validates shard integrity metadata before returning bars', async () => {
    const bars = await provider.getBars({
      symbol: 'XAUUSD',
      timeframe: '5m',
      fromMs: T0,
      toMs: T0 + 12 * FIVE_MIN_MS,
    });
    expect(bars).toHaveLength(12);
  });

  test('throws when manifest sha256 does not match the compressed shard', async () => {
    mutateManifest(root, (manifest) => {
      const shardEntry = manifest.shards.find((s) => s.symbol === 'XAUUSD' && s.timeframe === '5m');
      if (!shardEntry) throw new Error('test setup missing XAUUSD/5m shard');
      shardEntry.sha256 = `0${shardEntry.sha256.slice(1)}`;
    });
    const provider2 = new CachedFixtureProvider({ rootPath: root, instrumentSpecs: SPECS });
    await expect(
      provider2.getBars({ symbol: 'XAUUSD', timeframe: '5m', fromMs: T0, toMs: T0 + 1 }),
    ).rejects.toThrow(/sha256/);
  });

  test('throws when manifest barCount does not match parsed bars', async () => {
    mutateManifest(root, (manifest) => {
      const shardEntry = manifest.shards.find((s) => s.symbol === 'XAUUSD' && s.timeframe === '5m');
      if (!shardEntry) throw new Error('test setup missing XAUUSD/5m shard');
      shardEntry.barCount += 1;
    });
    const provider2 = new CachedFixtureProvider({ rootPath: root, instrumentSpecs: SPECS });
    await expect(
      provider2.getBars({ symbol: 'XAUUSD', timeframe: '5m', fromMs: T0, toMs: T0 + 1 }),
    ).rejects.toThrow(/barCount/);
  });

  test('throws when manifest byteSizeCompressed does not match the shard bytes', async () => {
    mutateManifest(root, (manifest) => {
      const shardEntry = manifest.shards.find((s) => s.symbol === 'XAUUSD' && s.timeframe === '5m');
      if (!shardEntry) throw new Error('test setup missing XAUUSD/5m shard');
      shardEntry.byteSizeCompressed += 1;
    });
    const provider2 = new CachedFixtureProvider({ rootPath: root, instrumentSpecs: SPECS });
    await expect(
      provider2.getBars({ symbol: 'XAUUSD', timeframe: '5m', fromMs: T0, toMs: T0 + 1 }),
    ).rejects.toThrow(/byteSizeCompressed/);
  });

  test('throws when manifest firstBarStart or lastBarStart does not match parsed bars', async () => {
    mutateManifest(root, (manifest) => {
      const shardEntry = manifest.shards.find((s) => s.symbol === 'XAUUSD' && s.timeframe === '5m');
      if (!shardEntry) throw new Error('test setup missing XAUUSD/5m shard');
      shardEntry.firstBarStart = T0 + FIVE_MIN_MS;
    });
    const provider2 = new CachedFixtureProvider({ rootPath: root, instrumentSpecs: SPECS });
    await expect(
      provider2.getBars({ symbol: 'XAUUSD', timeframe: '5m', fromMs: T0, toMs: T0 + 1 }),
    ).rejects.toThrow(/firstBarStart/);

    mutateManifest(root, (manifest) => {
      const shardEntry = manifest.shards.find((s) => s.symbol === 'XAUUSD' && s.timeframe === '5m');
      if (!shardEntry) throw new Error('test setup missing XAUUSD/5m shard');
      shardEntry.firstBarStart = T0;
      shardEntry.lastBarStart = T0;
    });
    const provider3 = new CachedFixtureProvider({ rootPath: root, instrumentSpecs: SPECS });
    await expect(
      provider3.getBars({ symbol: 'XAUUSD', timeframe: '5m', fromMs: T0, toMs: T0 + 1 }),
    ).rejects.toThrow(/lastBarStart/);
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
    const bars = [mkBar(T0 + FIVE_MIN_MS, 2350), mkBar(T0, 2350)];
    const integrity = writeJsonl(join(root, 'bars', 'XAUUSD', '5m.jsonl.gz'), bars);
    const shardEntry = manifest.shards[0];
    if (!shardEntry) throw new Error('test setup missing XAUUSD/5m shard');
    manifest.shards[0] = {
      ...shardEntry,
      firstBarStart: T0 + FIVE_MIN_MS,
      lastBarStart: T0,
      byteSizeCompressed: integrity.byteSizeCompressed,
      sha256: integrity.sha256,
    };
    writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest));
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
