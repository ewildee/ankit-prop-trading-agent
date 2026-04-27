import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BarDataCache, type BarFetcher } from './bar-data-cache.ts';
import type { Bar } from './types.ts';

const sample = (i: number): Bar => ({
  symbol: 'XAUUSD',
  timeframe: '5m',
  tsStart: 1_700_000_000_000 + i * 5 * 60_000,
  tsEnd: 1_700_000_000_000 + (i + 1) * 5 * 60_000,
  open: 2050 + i * 0.1,
  high: 2050.5 + i * 0.1,
  low: 2049.5 + i * 0.1,
  close: 2050.2 + i * 0.1,
  volume: 100 + i,
});

describe('bar-data-cache', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'eval-harness-bars-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('prefetch + read round-trips bars by primary key', async () => {
    const cache = new BarDataCache(join(dir, 'roundtrip.db'));
    const bars = [sample(0), sample(1), sample(2)];
    const first = bars[0];
    const last = bars[2];
    if (!first || !last) throw new Error('test setup error');
    cache.prefetch(bars);
    const got = await cache.read({
      symbol: 'XAUUSD',
      timeframe: '5m',
      fromMs: first.tsStart,
      toMs: last.tsEnd + 1,
    });
    expect(got).toEqual(bars);
    cache.close();
  });

  test('upsert on primary-key collision', async () => {
    const cache = new BarDataCache(join(dir, 'upsert.db'));
    cache.prefetch([sample(0)]);
    cache.prefetch([{ ...sample(0), close: 9999 }]);
    const got = await cache.read({
      symbol: 'XAUUSD',
      timeframe: '5m',
      fromMs: sample(0).tsStart,
      toMs: sample(0).tsEnd + 1,
    });
    expect(got[0]?.close).toBe(9999);
    cache.close();
  });

  test('NoFetcher throws on cold-miss read', async () => {
    const cache = new BarDataCache(join(dir, 'nofetch.db'));
    await expect(
      cache.read({ symbol: 'XAUUSD', timeframe: '5m', fromMs: 0, toMs: 1 }),
    ).rejects.toThrow(/no fetcher/);
    cache.close();
  });

  test('injected fetcher fills cache on miss', async () => {
    const fetcher: BarFetcher = {
      async fetch() {
        return [sample(10), sample(11)];
      },
    };
    const cache = new BarDataCache(join(dir, 'fetch.db'), fetcher);
    const a = await cache.read({
      symbol: 'XAUUSD',
      timeframe: '5m',
      fromMs: sample(10).tsStart,
      toMs: sample(11).tsEnd + 1,
    });
    expect(a.length).toBe(2);
    const b = await cache.read({
      symbol: 'XAUUSD',
      timeframe: '5m',
      fromMs: sample(10).tsStart,
      toMs: sample(11).tsEnd + 1,
    });
    expect(b).toEqual(a);
    cache.close();
  });
});
