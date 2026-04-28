import type { FixtureStore } from './fixture-store.ts';
import { estimateBars, TWELVEDATA_MAX_BARS_PER_CALL } from './planner.ts';
import {
  type BarLine,
  FIXTURE_SCHEMA_VERSION,
  type Manifest,
  type ShardEntry,
  type SymbolMetaFile,
} from './schema.ts';
import { type CanonicalSymbol, SYMBOL_CATALOG } from './symbols.ts';
import { type Timeframe, timeframeMs } from './timeframes.ts';
import type { TwelveDataClient } from './twelve-data-client.ts';

const PAGE_BAR_SAFETY_MARGIN = 0.9;

export type FetchPlanInput = {
  symbols: ReadonlyArray<CanonicalSymbol>;
  intradayTimeframes: ReadonlyArray<Timeframe>;
  intradayFromMs: number;
  intradayToMs: number;
  dailyTimeframes: ReadonlyArray<Timeframe>;
  dailyFromMs: number;
  dailyToMs: number;
};

export type FetchRunCfg = {
  client: TwelveDataClient;
  store: FixtureStore;
  fixtureVersion: string;
  fetchProviderTier: string;
  estimatedCredits: number;
  gitCommit: string | null;
  gitDirty: boolean;
  log?: (msg: string) => void;
};

export type FetchRunResult = {
  shards: ShardEntry[];
  creditsSpent: number;
  startedAt: string;
  endedAt: string;
};

export class FetchOrchestrator {
  private creditsSpent = 0;
  private readonly log: (msg: string) => void;

  constructor(
    private readonly cfg: FetchRunCfg,
    private readonly plan: FetchPlanInput,
  ) {
    this.log = cfg.log ?? (() => undefined);
  }

  async run(): Promise<FetchRunResult> {
    const startedAt = new Date().toISOString();
    await this.fetchSymbolMetas();
    const shards: ShardEntry[] = [];
    for (const symbol of this.plan.symbols) {
      for (const tf of this.plan.intradayTimeframes) {
        shards.push(
          await this.fillShard(symbol, tf, this.plan.intradayFromMs, this.plan.intradayToMs),
        );
      }
      for (const tf of this.plan.dailyTimeframes) {
        shards.push(await this.fillShard(symbol, tf, this.plan.dailyFromMs, this.plan.dailyToMs));
      }
    }
    const endedAt = new Date().toISOString();
    await this.writeManifest(shards, startedAt, endedAt);
    return { shards, creditsSpent: this.creditsSpent, startedAt, endedAt };
  }

  private async fetchSymbolMetas(): Promise<void> {
    for (const symbol of this.plan.symbols) {
      const existing = await this.cfg.store.readSymbolMeta(symbol);
      if (existing) {
        this.log(`[meta] ${symbol}: cached → ${existing.twelveDataAlias}`);
        continue;
      }
      const cat = SYMBOL_CATALOG[symbol];
      const candidates = [cat.twelveDataPrimaryAlias, ...cat.twelveDataAliasFallbacks];
      let resolvedAlias: string | null = null;
      let raw: unknown = null;
      for (const alias of candidates) {
        const res = await this.cfg.client.symbolSearch(alias);
        this.creditsSpent += 1;
        await this.cfg.store.appendFetchLog({
          t: new Date().toISOString(),
          op: 'symbol_search',
          symbol,
          query: alias,
          matched: res.bestMatch?.symbol ?? null,
          credits: 1,
        });
        if (res.bestMatch && res.bestMatch.symbol) {
          resolvedAlias = res.bestMatch.symbol;
          raw = res.raw;
          break;
        }
      }
      if (!resolvedAlias) {
        throw new Error(`unable to resolve TwelveData alias for ${symbol}`);
      }
      const meta: SymbolMetaFile = {
        symbol,
        twelveDataAlias: resolvedAlias,
        exchange: cat.exchange,
        instrumentType: cat.instrumentType,
        currency: cat.currency,
        timezone: cat.timezone,
        sessionCalendar: cat.sessionCalendar,
        dstHandling: 'exchange-local-tz',
        fetchedAt: new Date().toISOString(),
        rawSymbolSearch: raw,
      };
      await this.cfg.store.writeSymbolMeta(meta);
      this.log(`[meta] ${symbol}: resolved → ${resolvedAlias}`);
    }
  }

  private async fillShard(
    symbol: CanonicalSymbol,
    tf: Timeframe,
    fromMs: number,
    toMs: number,
  ): Promise<ShardEntry> {
    const tfMs = timeframeMs(tf);
    const meta = await this.cfg.store.readSymbolMeta(symbol);
    if (!meta) throw new Error(`symbol meta missing for ${symbol} (run fetchSymbolMetas first)`);
    const tdSymbol = meta.twelveDataAlias;
    const existing = await this.cfg.store.readShardBars(symbol, tf);
    const haveByTs = new Map<number, BarLine>();
    for (const b of existing) haveByTs.set(b.t, b);
    let cursor = fromMs;
    if (existing.length > 0) {
      const lastT = existing[existing.length - 1]!.t;
      cursor = Math.max(cursor, lastT + tfMs);
      this.log(`[shard] ${symbol}/${tf}: resuming from ${new Date(cursor).toISOString()}`);
    } else {
      this.log(`[shard] ${symbol}/${tf}: full pull from ${new Date(cursor).toISOString()}`);
    }
    while (cursor < toMs) {
      const chunkEnd = Math.min(toMs, this.computeChunkEnd(symbol, tf, cursor, toMs));
      const t0 = Date.now();
      const res = await this.cfg.client.timeSeries({
        tdSymbol,
        timeframe: tf,
        startMs: cursor,
        endMs: chunkEnd,
      });
      this.creditsSpent += 1;
      const durationMs = Date.now() - t0;
      let added = 0;
      for (const bar of res.bars) {
        if (bar.t < cursor || bar.t >= chunkEnd) continue;
        if (haveByTs.has(bar.t)) continue;
        haveByTs.set(bar.t, bar);
        added += 1;
      }
      await this.cfg.store.appendFetchLog({
        t: new Date().toISOString(),
        op: 'time_series',
        symbol,
        timeframe: tf,
        from: cursor,
        to: chunkEnd,
        bars: res.bars.length,
        added,
        credits: 1,
        durationMs,
      });
      this.log(
        `[shard] ${symbol}/${tf}: ${new Date(cursor).toISOString()} → ${new Date(chunkEnd).toISOString()} bars=${res.bars.length} added=${added}`,
      );
      cursor = chunkEnd;
    }
    const merged = [...haveByTs.values()].sort((a, b) => a.t - b.t);
    return await this.cfg.store.writeShardBars(symbol, tf, merged);
  }

  private computeChunkEnd(
    symbol: CanonicalSymbol,
    tf: Timeframe,
    cursor: number,
    toMs: number,
  ): number {
    const tfMs = timeframeMs(tf);
    if (tf === '1d') {
      return Math.min(toMs, cursor + TWELVEDATA_MAX_BARS_PER_CALL * tfMs);
    }
    const probeEnd = Math.min(toMs, cursor + 30 * 86_400_000);
    const probeBars = estimateBars(symbol, tf, cursor, probeEnd);
    if (probeBars === 0) return Math.min(toMs, cursor + 7 * 86_400_000);
    const probeDays = (probeEnd - cursor) / 86_400_000;
    const barsPerDay = probeBars / probeDays;
    const maxDays = Math.max(
      1,
      Math.floor((TWELVEDATA_MAX_BARS_PER_CALL * PAGE_BAR_SAFETY_MARGIN) / Math.max(1, barsPerDay)),
    );
    return Math.min(toMs, cursor + maxDays * 86_400_000);
  }

  private async writeManifest(
    shards: ReadonlyArray<ShardEntry>,
    startedAt: string,
    endedAt: string,
  ): Promise<void> {
    const manifest: Manifest = {
      schemaVersion: FIXTURE_SCHEMA_VERSION,
      fixtureVersion: this.cfg.fixtureVersion,
      fetchProvider: 'twelvedata',
      fetchProviderTier: this.cfg.fetchProviderTier,
      fetchedAtStart: startedAt,
      fetchedAtEnd: endedAt,
      intraday: {
        from: new Date(this.plan.intradayFromMs).toISOString(),
        to: new Date(this.plan.intradayToMs).toISOString(),
      },
      dailyTail: {
        from: new Date(this.plan.dailyFromMs).toISOString(),
        to: new Date(this.plan.dailyToMs).toISOString(),
      },
      symbols: [...this.plan.symbols],
      timeframes: {
        intraday: [...this.plan.intradayTimeframes],
        daily: [...this.plan.dailyTimeframes],
      },
      shards: [...shards],
      credits: { estimated: this.cfg.estimatedCredits, spent: this.creditsSpent },
      adversarialWindowsCount: 0,
      git: { commit: this.cfg.gitCommit, dirty: this.cfg.gitDirty },
    };
    await this.cfg.store.writeManifest(manifest);
  }
}
