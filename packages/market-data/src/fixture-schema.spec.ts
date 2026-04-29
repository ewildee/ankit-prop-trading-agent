import { describe, expect, test } from 'bun:test';
import {
  AdversarialWindowSchema,
  AdversarialWindowsFileSchema,
  BarLineSchema,
  FIXTURE_SCHEMA_VERSION,
  ManifestSchema,
  ShardEntrySchema,
  SymbolMetaSchema,
  TIMEFRAME_MS,
  timeframeMs,
} from './fixture-schema.ts';

describe('fixture-schema (mirrors @ankit-prop/market-data-twelvedata wire format)', () => {
  test('FIXTURE_SCHEMA_VERSION is the integer literal 1', () => {
    expect(FIXTURE_SCHEMA_VERSION).toBe(1);
  });

  test('BarLineSchema requires the compact `{t,o,h,l,c,v}` shape', () => {
    const ok = BarLineSchema.safeParse({
      t: 1_700_000_000_000,
      o: 1,
      h: 2,
      l: 0.5,
      c: 1.5,
      v: 100,
    });
    expect(ok.success).toBe(true);

    const negT = BarLineSchema.safeParse({ t: -1, o: 1, h: 2, l: 0.5, c: 1.5, v: 100 });
    expect(negT.success).toBe(false);

    const missing = BarLineSchema.safeParse({ t: 0, o: 1, h: 2, l: 0.5, c: 1.5 });
    expect(missing.success).toBe(false);
  });

  test('SymbolMetaSchema captures provider-side identity (no broker specs leak in)', () => {
    const ok = SymbolMetaSchema.safeParse({
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
    });
    expect(ok.success).toBe(true);
  });

  test('ShardEntrySchema requires sha256 and non-negative byte size', () => {
    const ok = ShardEntrySchema.safeParse({
      path: 'bars/XAUUSD/5m.jsonl.gz',
      symbol: 'XAUUSD',
      timeframe: '5m',
      barCount: 12,
      firstBarStart: 0,
      lastBarStart: 11 * 5 * 60_000,
      byteSizeCompressed: 4096,
      sha256: 'abc',
    });
    expect(ok.success).toBe(true);

    const negBytes = ShardEntrySchema.safeParse({
      path: 'bars/XAUUSD/5m.jsonl.gz',
      symbol: 'XAUUSD',
      timeframe: '5m',
      barCount: 12,
      firstBarStart: null,
      lastBarStart: null,
      byteSizeCompressed: -1,
      sha256: 'abc',
    });
    expect(negBytes.success).toBe(false);
  });

  test('ManifestSchema rejects unknown schemaVersion and non-twelvedata providers (until extended)', () => {
    const v2 = ManifestSchema.safeParse({
      schemaVersion: 2,
      fixtureVersion: 'x',
      fetchProvider: 'twelvedata',
      fetchProviderTier: 'grow',
      fetchedAtStart: '2026-04-28T10:00:00.000Z',
      fetchedAtEnd: '2026-04-28T11:00:00.000Z',
      intraday: { from: '2026-01-28', to: '2026-04-28' },
      dailyTail: { from: '2025-10-28', to: '2026-04-28' },
      symbols: ['XAUUSD'],
      timeframes: { intraday: ['5m'], daily: ['1d'] },
      shards: [],
      credits: { estimated: 0, spent: 0 },
      adversarialWindowsCount: 0,
      git: null,
    });
    expect(v2.success).toBe(false);

    const wrongProvider = ManifestSchema.safeParse({
      schemaVersion: 1,
      fixtureVersion: 'x',
      fetchProvider: 'ctrader',
      fetchProviderTier: 'grow',
      fetchedAtStart: '2026-04-28T10:00:00.000Z',
      fetchedAtEnd: '2026-04-28T11:00:00.000Z',
      intraday: { from: '2026-01-28', to: '2026-04-28' },
      dailyTail: { from: '2025-10-28', to: '2026-04-28' },
      symbols: ['XAUUSD'],
      timeframes: { intraday: ['5m'], daily: ['1d'] },
      shards: [],
      credits: { estimated: 0, spent: 0 },
      adversarialWindowsCount: 0,
      git: null,
    });
    expect(wrongProvider.success).toBe(false);
  });

  test('AdversarialWindowSchema accepts pre-windowed news + closure shapes', () => {
    const news = AdversarialWindowSchema.safeParse({
      id: 'nfp-2026-04-03',
      kind: 'news',
      category: 'NFP',
      startMs: 1_712_232_000_000 - 30 * 60_000,
      endMs: 1_712_232_000_000 + 30 * 60_000,
      eventTsMs: 1_712_232_000_000,
      symbols: ['XAUUSD', 'NAS100'],
      impact: 'high',
    });
    expect(news.success).toBe(true);

    const closure = AdversarialWindowSchema.safeParse({
      id: 'us-good-friday-2026',
      kind: 'holiday',
      category: 'us-equity-closure',
      startMs: 0,
      endMs: 24 * 60 * 60_000,
      eventTsMs: 0,
      symbols: ['NAS100'],
      impact: 'closure',
    });
    expect(closure.success).toBe(true);

    const noSymbols = AdversarialWindowSchema.safeParse({
      id: 'x',
      kind: 'news',
      category: 'NFP',
      startMs: 0,
      endMs: 1,
      eventTsMs: 0,
      symbols: [],
      impact: 'high',
    });
    expect(noSymbols.success).toBe(false);

    const missingEventTs = AdversarialWindowSchema.safeParse({
      id: 'missing-event-ts',
      kind: 'news',
      category: 'NFP',
      startMs: 0,
      endMs: 1,
      symbols: ['XAUUSD'],
      impact: 'high',
    });
    expect(missingEventTs.success).toBe(false);
  });

  test('AdversarialWindowsFileSchema requires schemaVersion alignment', () => {
    const ok = AdversarialWindowsFileSchema.safeParse({
      schemaVersion: 1,
      curatedAt: '2026-04-28T10:00:00.000Z',
      source: 'manual-curated',
      windows: [],
    });
    expect(ok.success).toBe(true);
  });

  test('TIMEFRAME_MS / timeframeMs mirror the producer-supported timeframes', () => {
    expect(Object.keys(TIMEFRAME_MS).sort()).toEqual(['15m', '1d', '1h', '1m', '5m']);
    expect(TIMEFRAME_MS['1m']).toBe(60_000);
    expect(TIMEFRAME_MS['5m']).toBe(300_000);
    expect(TIMEFRAME_MS['15m']).toBe(900_000);
    expect(TIMEFRAME_MS['1h']).toBe(3_600_000);
    expect(TIMEFRAME_MS['1d']).toBe(86_400_000);
    expect(timeframeMs('5m')).toBe(300_000);
    expect(timeframeMs('4h')).toBeUndefined();
    expect(timeframeMs('totally-bogus')).toBeUndefined();
  });
});
