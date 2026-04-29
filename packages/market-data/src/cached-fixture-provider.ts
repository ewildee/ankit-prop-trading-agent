import { join } from 'node:path';
import {
  type AdversarialWindow,
  AdversarialWindowsFileSchema,
  BarLineSchema,
  FIXTURE_SCHEMA_VERSION,
  type Manifest,
  ManifestSchema,
  type ShardEntry,
  type SymbolMetaFile,
  SymbolMetaSchema,
  timeframeMs,
} from './fixture-schema.ts';
import type { IMarketDataProvider } from './provider.ts';
import {
  type Bar,
  type CalendarEvent,
  type InstrumentSpec,
  MarketDataNotAvailable,
  type MarketDataQuery,
  type SymbolAvailability,
  type SymbolMeta,
} from './types.ts';

export type CachedFixtureProviderOptions = {
  // Absolute path to a fixture root produced by ANKA-68 TwelveData fetcher
  // (`@ankit-prop/market-data-twelvedata`). Layout described in
  // `fixture-schema.ts`.
  rootPath: string;
  // Broker-side execution specs (pip / contract / typical spread) keyed by
  // canonical symbol. The historical fetcher does not produce these — they
  // belong to broker config. Eval-harness / trader inject them at construction.
  // Symbols missing from this map will be returned by `listSymbols()` /
  // `resolveSymbol()` with `pipSize`/`contractSize`/`typicalSpreadPips = 0`,
  // which makes mis-wiring loud at simulation time.
  instrumentSpecs?: Record<string, InstrumentSpec>;
};

const ZERO_SPEC: InstrumentSpec = { pipSize: 0, contractSize: 0, typicalSpreadPips: 0 };

export class CachedFixtureProvider implements IMarketDataProvider {
  private manifest: Manifest | null = null;
  private symbolMetas: Map<string, SymbolMeta> | null = null;
  private adversarial: AdversarialWindow[] | null = null;
  private barCache = new Map<string, Bar[]>();
  private windowIndex = new Map<string, { fromMs: number | null; toMs: number | null }>();
  private shardByKey = new Map<string, ShardEntry>();

  constructor(private readonly opts: CachedFixtureProviderOptions) {}

  async listSymbols(): Promise<readonly SymbolMeta[]> {
    await this.loadHeader();
    if (!this.symbolMetas) throw new Error('market-data: symbolMetas missing post-load');
    return [...this.symbolMetas.values()];
  }

  async resolveSymbol(symbol: string): Promise<SymbolMeta | undefined> {
    await this.loadHeader();
    return this.symbolMetas?.get(symbol);
  }

  async listAvailability(): Promise<readonly SymbolAvailability[]> {
    await this.loadHeader();
    if (!this.manifest) throw new Error('market-data: manifest missing post-load');
    const grouped = new Map<string, Set<string>>();
    for (const shard of this.manifest.shards) {
      let set = grouped.get(shard.symbol);
      if (!set) {
        set = new Set();
        grouped.set(shard.symbol, set);
      }
      set.add(shard.timeframe);
    }
    return [...grouped.entries()].map(([symbol, set]) => ({
      symbol,
      timeframes: [...set],
    }));
  }

  async getBars(query: MarketDataQuery): Promise<readonly Bar[]> {
    await this.loadHeader();
    const key = barKey(query.symbol, query.timeframe);
    if (!this.windowIndex.has(key)) {
      throw new MarketDataNotAvailable(
        query.symbol,
        query.timeframe,
        'no shard entry — fetcher did not include this pair',
      );
    }
    if (query.toMs <= query.fromMs) return [];
    const all = await this.loadBars(query.symbol, query.timeframe);
    return all.filter((b) => b.tsStart >= query.fromMs && b.tsStart < query.toMs);
  }

  async getEvents(args: { fromMs: number; toMs: number }): Promise<readonly CalendarEvent[]> {
    await this.loadAdversarial();
    if (!this.adversarial) return [];
    if (args.toMs <= args.fromMs) return [];
    return this.adversarial
      .filter((w) => {
        const tsMs = w.kind === 'news' ? w.eventTsMs : w.startMs;
        return tsMs >= args.fromMs && tsMs < args.toMs;
      })
      .map(toCalendarEvent);
  }

  // Diagnostic accessor — not part of IMarketDataProvider.
  async getManifest(): Promise<Manifest> {
    await this.loadHeader();
    if (!this.manifest) throw new Error('market-data: manifest missing post-load');
    return this.manifest;
  }

  private async loadHeader(): Promise<void> {
    if (this.manifest && this.symbolMetas) return;
    const manifestRaw = await readJsonFile(join(this.opts.rootPath, 'manifest.json'));
    const manifest = ManifestSchema.parse(manifestRaw);
    if (manifest.schemaVersion !== FIXTURE_SCHEMA_VERSION) {
      throw new Error(
        `market-data: fixture schemaVersion ${manifest.schemaVersion} != supported ${FIXTURE_SCHEMA_VERSION}`,
      );
    }
    this.manifest = manifest;

    for (const shard of manifest.shards) {
      const key = barKey(shard.symbol, shard.timeframe);
      this.windowIndex.set(key, {
        fromMs: shard.firstBarStart,
        toMs: shard.lastBarStart,
      });
      this.shardByKey.set(key, shard);
    }

    const metas = new Map<string, SymbolMeta>();
    for (const symbol of manifest.symbols) {
      const path = join(this.opts.rootPath, 'symbols', `${symbol}.meta.json`);
      const raw = await readJsonFile(path);
      const meta = SymbolMetaSchema.parse(raw);
      if (meta.symbol !== symbol) {
        throw new Error(
          `market-data: ${path} reports symbol="${meta.symbol}" but manifest expected "${symbol}"`,
        );
      }
      metas.set(symbol, this.composeSymbolMeta(meta));
    }
    this.symbolMetas = metas;
  }

  private composeSymbolMeta(file: SymbolMetaFile): SymbolMeta {
    const spec = this.opts.instrumentSpecs?.[file.symbol] ?? ZERO_SPEC;
    return {
      symbol: file.symbol,
      pipSize: spec.pipSize,
      contractSize: spec.contractSize,
      typicalSpreadPips: spec.typicalSpreadPips,
      providerSymbol: file.twelveDataAlias,
      exchange: file.exchange,
      sessionTz: file.timezone,
    };
  }

  private async loadBars(symbol: string, timeframe: string): Promise<Bar[]> {
    const key = barKey(symbol, timeframe);
    const cached = this.barCache.get(key);
    if (cached) return cached;
    const shard = this.shardByKey.get(key);
    if (!shard) {
      throw new Error(
        `market-data: manifest shard missing for ${symbol}/${timeframe} after availability check`,
      );
    }
    const path = join(this.opts.rootPath, 'bars', symbol, `${timeframe}.jsonl.gz`);
    const file = Bun.file(path);
    if (!(await file.exists())) {
      throw new MarketDataNotAvailable(
        symbol,
        timeframe,
        `expected fixture file at ${path} (manifest claims it exists)`,
      );
    }
    const stepMs = timeframeMs(timeframe);
    if (stepMs === undefined) {
      throw new Error(
        `market-data: unknown timeframe "${timeframe}" — cannot derive tsEnd. Add it to TIMEFRAME_MS.`,
      );
    }
    const compressed = await file.bytes();
    if (shard.byteSizeCompressed !== compressed.length) {
      throw new Error(
        `market-data: shard ${symbol}/${timeframe} byteSizeCompressed mismatch: manifest=${shard.byteSizeCompressed} actual=${compressed.length}`,
      );
    }
    const sha256 = new Bun.CryptoHasher('sha256').update(compressed).digest('hex');
    if (shard.sha256 !== sha256) {
      throw new Error(
        `market-data: shard ${symbol}/${timeframe} sha256 mismatch: manifest=${shard.sha256} actual=${sha256}`,
      );
    }
    const decompressed = compressed.length === 0 ? new Uint8Array() : Bun.gunzipSync(compressed);
    const text = new TextDecoder().decode(decompressed);
    const bars: Bar[] = [];
    let lastTsStart = -Infinity;
    let lineNum = 0;
    for (const rawLine of text.split('\n')) {
      lineNum += 1;
      const line = rawLine.trim();
      if (line.length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        throw new Error(`market-data: ${path}:${lineNum} invalid JSON — ${(err as Error).message}`);
      }
      const rec = BarLineSchema.parse(parsed);
      if (rec.t <= lastTsStart) {
        throw new Error(
          `market-data: ${path}:${lineNum} bars not strictly ascending (t=${rec.t} <= prev=${lastTsStart})`,
        );
      }
      lastTsStart = rec.t;
      bars.push({
        symbol,
        timeframe,
        tsStart: rec.t,
        tsEnd: rec.t + stepMs,
        open: rec.o,
        high: rec.h,
        low: rec.l,
        close: rec.c,
        volume: rec.v,
      });
    }
    validateShardMetadata(shard, bars);
    this.barCache.set(key, bars);
    return bars;
  }

  private async loadAdversarial(): Promise<void> {
    if (this.adversarial !== null) return;
    const path = join(this.opts.rootPath, 'adversarial-windows.json');
    const file = Bun.file(path);
    if (!(await file.exists())) {
      this.adversarial = [];
      return;
    }
    const raw = JSON.parse(await file.text());
    const parsed = AdversarialWindowsFileSchema.parse(raw);
    if (parsed.schemaVersion !== FIXTURE_SCHEMA_VERSION) {
      throw new Error(
        `market-data: adversarial-windows.json schemaVersion ${parsed.schemaVersion} != supported ${FIXTURE_SCHEMA_VERSION}`,
      );
    }
    this.adversarial = parsed.windows;
  }
}

function barKey(symbol: string, timeframe: string): string {
  return `${symbol}::${timeframe}`;
}

// Projects a pre-windowed AdversarialWindow into a point-in-time
// CalendarEvent. For news, the timestamp is the actual print time
// (eventTsMs); eval-harness re-derives the FTMO ±5m blackout / 2h pre-news
// envelopes from this anchor per BLUEPRINT §11.5. For closures, the closure
// start IS the event. There is no fallback path — eventTsMs is contractually
// required by the v1 fixture schema and any missing field is a fixture-
// integrity bug we surface loudly.
function toCalendarEvent(w: AdversarialWindow): CalendarEvent {
  const impact: CalendarEvent['impact'] =
    w.impact === 'closure' || w.impact === 'high' ? 'high' : w.impact;
  const restricted = w.kind === 'news' || w.impact === 'closure';
  const timestamp = w.kind === 'news' ? w.eventTsMs : w.startMs;
  return {
    id: w.id,
    timestamp,
    symbols: [...w.symbols],
    impact,
    restricted,
  };
}

function validateShardMetadata(shard: ShardEntry, bars: ReadonlyArray<Bar>): void {
  const label = `${shard.symbol}/${shard.timeframe}`;
  if (shard.barCount !== bars.length) {
    throw new Error(
      `market-data: shard ${label} barCount mismatch: manifest=${shard.barCount} actual=${bars.length}`,
    );
  }
  const first = bars[0]?.tsStart ?? null;
  const last = bars.at(-1)?.tsStart ?? null;
  if (shard.firstBarStart !== first) {
    throw new Error(
      `market-data: shard ${label} firstBarStart mismatch: manifest=${shard.firstBarStart} actual=${first}`,
    );
  }
  if (shard.lastBarStart !== last) {
    throw new Error(
      `market-data: shard ${label} lastBarStart mismatch: manifest=${shard.lastBarStart} actual=${last}`,
    );
  }
}

async function readJsonFile(path: string): Promise<unknown> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`market-data: required fixture file missing: ${path}`);
  }
  return JSON.parse(await file.text());
}
