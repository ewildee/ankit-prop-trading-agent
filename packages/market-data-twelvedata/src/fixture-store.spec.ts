import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FixtureStore } from './fixture-store.ts';
import { FIXTURE_SCHEMA_VERSION, type Manifest, type SymbolMetaFile } from './schema.ts';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'td-fixture-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('FixtureStore', () => {
  test('round-trips a bar shard through gzipped JSONL', async () => {
    const store = new FixtureStore({ rootDir: root });
    const bars = Array.from({ length: 50 }, (_, i) => ({
      t: 1_700_000_000_000 + i * 60_000,
      o: 100 + i,
      h: 100.5 + i,
      l: 99.5 + i,
      c: 100.2 + i,
      v: 10 + i,
    }));
    const entry = await store.writeShardBars('NAS100', '1m', bars);
    expect(entry.barCount).toBe(50);
    expect(entry.firstBarStart).toBe(bars[0]!.t);
    expect(entry.lastBarStart).toBe(bars[bars.length - 1]!.t);
    expect(entry.path).toBe('bars/NAS100/1m.jsonl.gz');
    expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
    const readBack = await store.readShardBars('NAS100', '1m');
    expect(readBack).toEqual(bars);
  });

  test('writeShardBars rejects malformed bar (NaN OHLCV) at write time (ANKA-72 BLOCK)', async () => {
    const store = new FixtureStore({ rootDir: root });
    const bars = [
      { t: 1_700_000_000_000, o: 100, h: Number.NaN, l: 99, c: 100, v: 0 },
    ] as unknown as Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
    await expect(store.writeShardBars('NAS100', '1m', bars)).rejects.toThrow(/schema validation/);
  });

  test('readShardBars on missing shard returns empty (so resume from-scratch is safe)', async () => {
    const store = new FixtureStore({ rootDir: root });
    expect(await store.readShardBars('XAUUSD', '1h')).toEqual([]);
  });

  test('persists symbol meta and reads it back via Zod-parsed payload', async () => {
    const store = new FixtureStore({ rootDir: root });
    const meta: SymbolMetaFile = {
      symbol: 'XAUUSD',
      twelveDataAlias: 'XAU/USD',
      exchange: 'Physical Currency',
      instrumentType: 'Forex',
      currency: 'USD',
      timezone: 'UTC',
      sessionCalendar: 'forex-24x5',
      dstHandling: 'exchange-local-tz',
      fetchedAt: new Date().toISOString(),
      rawSymbolSearch: { data: [{ symbol: 'XAU/USD' }] },
    };
    await store.writeSymbolMeta(meta);
    const got = await store.readSymbolMeta('XAUUSD');
    expect(got?.twelveDataAlias).toBe('XAU/USD');
  });

  test('manifest write/read round-trip retains shard list and credit numbers', async () => {
    const store = new FixtureStore({ rootDir: root });
    const manifest: Manifest = {
      schemaVersion: FIXTURE_SCHEMA_VERSION,
      fixtureVersion: 'v1.0.0-2026-04-28',
      fetchProvider: 'twelvedata',
      fetchProviderTier: 'grow',
      fetchedAtStart: '2026-04-28T10:00:00.000Z',
      fetchedAtEnd: '2026-04-28T10:42:00.000Z',
      intraday: { from: '2026-01-28T00:00:00.000Z', to: '2026-04-28T00:00:00.000Z' },
      dailyTail: { from: '2025-10-28T00:00:00.000Z', to: '2026-04-28T00:00:00.000Z' },
      symbols: ['NAS100', 'XAUUSD'],
      timeframes: { intraday: ['1m', '5m', '15m', '1h'], daily: ['1d'] },
      shards: [
        {
          path: 'bars/NAS100/1m.jsonl.gz',
          symbol: 'NAS100',
          timeframe: '1m',
          barCount: 100,
          firstBarStart: 1,
          lastBarStart: 99,
          byteSizeCompressed: 12345,
          sha256: 'a'.repeat(64),
        },
      ],
      credits: { estimated: 40, spent: 41 },
      adversarialWindowsCount: 18,
      git: { commit: null, dirty: false },
    };
    await store.writeManifest(manifest);
    const back = await store.readManifest();
    expect(back).not.toBeNull();
    expect(back?.shards).toHaveLength(1);
    expect(back?.credits.spent).toBe(41);
  });

  test('appendFetchLog adds JSONL lines without truncating existing entries', async () => {
    const store = new FixtureStore({ rootDir: root });
    await store.appendFetchLog({ op: 'symbol_search', i: 1 });
    await store.appendFetchLog({ op: 'time_series', i: 2 });
    const text = await Bun.file(store.fetchLogPath()).text();
    const lines = text.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).i).toBe(1);
    expect(JSON.parse(lines[1]!).i).toBe(2);
  });
});
