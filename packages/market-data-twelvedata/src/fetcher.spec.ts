import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FetchOrchestrator, type FetchPlanInput } from './fetcher.ts';
import { FixtureStore } from './fixture-store.ts';
import { CreditRateLimiter } from './rate-limiter.ts';
import { TwelveDataClient } from './twelve-data-client.ts';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'td-fetcher-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

type CallRecord = { url: string };

function makeStubFetch(records: CallRecord[], responder: (url: URL) => unknown): typeof fetch {
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    records.push({ url: `${url.pathname}?${url.searchParams}` });
    const body = responder(url);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

function isoUtc(ms: number): string {
  const d = new Date(ms);
  const s = d.toISOString();
  return s.replace('T', ' ').slice(0, 19);
}

const PLAN_BASE: FetchPlanInput = {
  symbols: ['NAS100'],
  intradayTimeframes: ['1h'],
  intradayFromMs: Date.UTC(2026, 0, 1, 0),
  intradayToMs: Date.UTC(2026, 0, 1, 5),
  dailyTimeframes: ['1d'],
  dailyFromMs: Date.UTC(2025, 11, 25),
  dailyToMs: Date.UTC(2026, 0, 1),
};

function intervalToMs(interval: string): number {
  if (interval === '1day') return 86_400_000;
  if (interval === '1h') return 3_600_000;
  if (interval === '15min') return 15 * 60_000;
  if (interval === '5min') return 5 * 60_000;
  return 60_000;
}

describe('FetchOrchestrator', () => {
  test('end-to-end: resolves symbol meta, fills shard, writes manifest', async () => {
    const records: CallRecord[] = [];
    const fetchImpl = makeStubFetch(records, (url) => {
      if (url.pathname === '/symbol_search') {
        return {
          data: [{ symbol: 'NDX', exchange: 'NASDAQ', currency: 'USD', instrument_type: 'Index' }],
        };
      }
      const startMs = Date.parse(`${url.searchParams.get('start_date')}Z`);
      const endMs = Date.parse(`${url.searchParams.get('end_date')}Z`);
      const tfMs = intervalToMs(url.searchParams.get('interval') ?? '1h');
      const values: Array<Record<string, string>> = [];
      for (let t = endMs - tfMs; t >= startMs; t -= tfMs) {
        values.push({
          datetime: tfMs >= 86_400_000 ? new Date(t).toISOString().slice(0, 10) : isoUtc(t),
          open: '17000',
          high: '17010',
          low: '16990',
          close: '17005',
          volume: '0',
        });
      }
      return { status: 'ok', meta: { symbol: 'NDX' }, values };
    });
    const limiter = new CreditRateLimiter({ creditsPerMinute: 1000 });
    const client = new TwelveDataClient({ apiKey: 'test', rateLimiter: limiter, fetchImpl });
    const store = new FixtureStore({ rootDir: root });
    const orch = new FetchOrchestrator(
      {
        client,
        store,
        fixtureVersion: 'v1.0.0-test',
        fetchProviderTier: 'grow',
        estimatedCredits: 5,
        gitCommit: null,
        gitDirty: false,
      },
      PLAN_BASE,
    );
    const result = await orch.run();
    expect(result.shards).toHaveLength(2);
    expect(result.shards[0]!.timeframe).toBe('1h');
    expect(result.shards[0]!.barCount).toBe(5);
    expect(result.shards[1]!.timeframe).toBe('1d');
    expect(result.shards[1]!.barCount).toBeGreaterThan(0);
    const meta = await store.readSymbolMeta('NAS100');
    expect(meta?.twelveDataAlias).toBe('NDX');
    const manifest = await store.readManifest();
    expect(manifest?.fixtureVersion).toBe('v1.0.0-test');
    expect(manifest?.credits.spent).toBeGreaterThan(0);
  });

  test('saturated page: TwelveData returns outputsize bars, fetcher backfills the missing prefix (ANKA-72 BLOCK)', async () => {
    const tfMs = 3_600_000;
    const fromMs = Date.UTC(2026, 0, 1, 0);
    const toMs = Date.UTC(2026, 0, 1, 12);
    const totalBars = 12;
    const outputsize = 5;
    const records: CallRecord[] = [];
    const fetchImpl = makeStubFetch(records, (url) => {
      if (url.pathname === '/symbol_search') {
        return { data: [{ symbol: 'NDX' }] };
      }
      const startMs = Date.parse(`${url.searchParams.get('start_date')}Z`);
      const endMs = Date.parse(`${url.searchParams.get('end_date')}Z`);
      const requestedOutputsize = Number(url.searchParams.get('outputsize') ?? '5000');
      const allBars: Array<{
        datetime: string;
        open: string;
        high: string;
        low: string;
        close: string;
        volume: string;
      }> = [];
      for (let t = endMs - tfMs; t >= startMs; t -= tfMs) {
        allBars.push({
          datetime: isoUtc(t),
          open: '17000',
          high: '17010',
          low: '16990',
          close: '17005',
          volume: '0',
        });
      }
      const truncated = allBars.slice(0, requestedOutputsize);
      return { status: 'ok', meta: { symbol: 'NDX' }, values: truncated };
    });
    const limiter = new CreditRateLimiter({ creditsPerMinute: 1000 });
    const client = new TwelveDataClient({ apiKey: 'test', rateLimiter: limiter, fetchImpl });
    const store = new FixtureStore({ rootDir: root });
    const orch = new FetchOrchestrator(
      {
        client,
        store,
        fixtureVersion: 'v-saturation-test',
        fetchProviderTier: 'grow',
        estimatedCredits: 5,
        gitCommit: null,
        gitDirty: false,
        timeSeriesOutputsize: outputsize,
      },
      {
        symbols: ['NAS100'],
        intradayTimeframes: ['1h'],
        intradayFromMs: fromMs,
        intradayToMs: toMs,
        dailyTimeframes: ['1d'],
        dailyFromMs: Date.UTC(2025, 11, 31),
        dailyToMs: Date.UTC(2026, 0, 1),
      },
    );
    const result = await orch.run();
    const intradayShard = result.shards.find((s) => s.timeframe === '1h')!;
    expect(intradayShard.barCount).toBe(totalBars);
    const merged = await store.readShardBars('NAS100', '1h');
    expect(merged.map((b) => b.t)).toEqual(
      Array.from({ length: totalBars }, (_, i) => fromMs + i * tfMs),
    );
    const tsCalls = records.filter((r) => r.url.startsWith('/time_series')).length;
    expect(tsCalls).toBeGreaterThanOrEqual(Math.ceil(totalBars / outputsize));
  });

  test('saturated page that cannot advance fails closed (ANKA-72 BLOCK)', async () => {
    const tfMs = 3_600_000;
    const fromMs = Date.UTC(2026, 0, 1, 0);
    const toMs = Date.UTC(2026, 0, 1, 5);
    const records: CallRecord[] = [];
    const fetchImpl = makeStubFetch(records, (url) => {
      if (url.pathname === '/symbol_search') return { data: [{ symbol: 'NDX' }] };
      const startMs = Date.parse(`${url.searchParams.get('start_date')}Z`);
      const requestedOutputsize = Number(url.searchParams.get('outputsize') ?? '5000');
      const values: Array<Record<string, string>> = [];
      for (let i = 0; i < requestedOutputsize; i++) {
        const t = startMs - (i + 1) * tfMs;
        values.push({
          datetime: isoUtc(t),
          open: '17000',
          high: '17010',
          low: '16990',
          close: '17005',
          volume: '0',
        });
      }
      return { status: 'ok', meta: { symbol: 'NDX' }, values };
    });
    const client = new TwelveDataClient({
      apiKey: 'test',
      rateLimiter: new CreditRateLimiter({ creditsPerMinute: 1000 }),
      fetchImpl,
    });
    const store = new FixtureStore({ rootDir: root });
    const orch = new FetchOrchestrator(
      {
        client,
        store,
        fixtureVersion: 'v-saturation-fail',
        fetchProviderTier: 'grow',
        estimatedCredits: 5,
        gitCommit: null,
        gitDirty: false,
        timeSeriesOutputsize: 3,
      },
      {
        symbols: ['NAS100'],
        intradayTimeframes: ['1h'],
        intradayFromMs: fromMs,
        intradayToMs: toMs,
        dailyTimeframes: ['1d'],
        dailyFromMs: Date.UTC(2025, 11, 31),
        dailyToMs: Date.UTC(2026, 0, 1),
      },
    );
    await expect(orch.run()).rejects.toThrow(/saturated page/);
  });

  test('orchestrator counts HTTP attempts (not logical calls) toward creditsSpent (ANKA-72 major)', async () => {
    const tfMs = 3_600_000;
    const fromMs = Date.UTC(2026, 0, 1, 0);
    const toMs = Date.UTC(2026, 0, 1, 2);
    let tsCalls = 0;
    const fetchImpl = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = new URL(typeof input === 'string' ? input : input.toString());
      if (url.pathname === '/symbol_search') {
        return new Response(JSON.stringify({ data: [{ symbol: 'NDX' }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      tsCalls++;
      if (tsCalls === 1) {
        return new Response(JSON.stringify({ message: 'rl' }), { status: 429 });
      }
      const startMs = Date.parse(`${url.searchParams.get('start_date')}Z`);
      const endMs = Date.parse(`${url.searchParams.get('end_date')}Z`);
      const values: Array<Record<string, string>> = [];
      for (let t = endMs - tfMs; t >= startMs; t -= tfMs) {
        values.push({
          datetime: isoUtc(t),
          open: '1',
          high: '1',
          low: '1',
          close: '1',
          volume: '0',
        });
      }
      return new Response(JSON.stringify({ status: 'ok', meta: {}, values }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const client = new TwelveDataClient({
      apiKey: 'test',
      rateLimiter: new CreditRateLimiter({ creditsPerMinute: 1000 }),
      fetchImpl,
      retryBackoffMs: 1,
    });
    const store = new FixtureStore({ rootDir: root });
    const orch = new FetchOrchestrator(
      {
        client,
        store,
        fixtureVersion: 'v-credit-attempts',
        fetchProviderTier: 'grow',
        estimatedCredits: 0,
        gitCommit: null,
        gitDirty: false,
      },
      {
        symbols: ['NAS100'],
        intradayTimeframes: ['1h'],
        intradayFromMs: fromMs,
        intradayToMs: toMs,
        dailyTimeframes: ['1d'],
        dailyFromMs: Date.UTC(2025, 11, 31),
        dailyToMs: Date.UTC(2026, 0, 1),
      },
    );
    const result = await orch.run();
    // 1 successful symbol_search (1 attempt) + 1 retried time_series (2 attempts) + 1 successful daily (1 attempt) = 4
    expect(result.creditsSpent).toBe(4);
  });

  test('resume: pre-existing shard means re-run fetches only the missing tail', async () => {
    const store = new FixtureStore({ rootDir: root });
    const tfMs = 3_600_000;
    const seedBars = [
      { t: PLAN_BASE.intradayFromMs, o: 1, h: 1, l: 1, c: 1, v: 0 },
      { t: PLAN_BASE.intradayFromMs + tfMs, o: 2, h: 2, l: 2, c: 2, v: 0 },
    ];
    await store.writeShardBars('NAS100', '1h', seedBars);
    await store.writeSymbolMeta({
      symbol: 'NAS100',
      twelveDataAlias: 'NDX',
      exchange: 'NASDAQ',
      instrumentType: 'Index',
      currency: 'USD',
      timezone: 'America/New_York',
      sessionCalendar: 'us-equity',
      dstHandling: 'exchange-local-tz',
      fetchedAt: '2026-04-28T10:00:00Z',
      rawSymbolSearch: {},
    });
    const records: CallRecord[] = [];
    const fetchImpl = makeStubFetch(records, (url) => {
      if (url.pathname === '/symbol_search') {
        return { data: [{ symbol: 'NDX' }] };
      }
      const interval = url.searchParams.get('interval') ?? '1h';
      const stepMs = intervalToMs(interval);
      const startMs = Date.parse(`${url.searchParams.get('start_date')}Z`);
      const endMs = Date.parse(`${url.searchParams.get('end_date')}Z`);
      if (interval === '1h') {
        expect(startMs).toBeGreaterThanOrEqual(PLAN_BASE.intradayFromMs + 2 * tfMs);
      }
      const values: Array<Record<string, string>> = [];
      for (let t = endMs - stepMs; t >= startMs; t -= stepMs) {
        values.push({
          datetime: stepMs >= 86_400_000 ? new Date(t).toISOString().slice(0, 10) : isoUtc(t),
          open: '17000',
          high: '17010',
          low: '16990',
          close: '17005',
          volume: '0',
        });
      }
      return { status: 'ok', meta: { symbol: 'NDX' }, values };
    });
    const client = new TwelveDataClient({
      apiKey: 'test',
      rateLimiter: new CreditRateLimiter({ creditsPerMinute: 1000 }),
      fetchImpl,
    });
    const orch = new FetchOrchestrator(
      {
        client,
        store,
        fixtureVersion: 'v1.0.0-test',
        fetchProviderTier: 'grow',
        estimatedCredits: 5,
        gitCommit: null,
        gitDirty: false,
      },
      PLAN_BASE,
    );
    const result = await orch.run();
    const merged = await store.readShardBars('NAS100', '1h');
    expect(merged).toHaveLength(5);
    expect(merged[0]!.t).toBe(PLAN_BASE.intradayFromMs);
    expect(merged[0]!.o).toBe(1);
    expect(merged[1]!.o).toBe(2);
    expect(records.some((r) => r.url.startsWith('/symbol_search'))).toBe(false);
    expect(result.shards[0]!.barCount).toBe(5);
  });
});
