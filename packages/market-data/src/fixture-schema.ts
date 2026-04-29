import { z } from 'zod';

// Cached-fixture wire format consumed by CachedFixtureProvider. Mirrors the
// on-disk shape produced by `@ankit-prop/market-data-twelvedata` (ANKA-68) so
// the same fixture root is the seam between fetcher and harness. Schemas are
// intentionally duplicated rather than imported across packages: keeping the
// consumer-side schema in this package lets future providers (cTrader-history)
// write the same shape without forcing a cross-dependency on a TD-specific
// fetcher. See ADR-0003.
//
// Layout under <rootPath>/:
//   manifest.json                          ManifestSchema
//   symbols/<canonical>.meta.json          SymbolMetaSchema
//   bars/<canonical>/<tf>.jsonl.gz         BarLineSchema (one row per line)
//   adversarial-windows.json               AdversarialWindowsFileSchema (optional)

export const FIXTURE_SCHEMA_VERSION = 1 as const;

// Compact bar row. `t` is the bar-start epoch ms (UTC). `tsEnd` is NOT stored
// on disk — CachedFixtureProvider derives it from `t + timeframeMs(tf)` so
// timeframe coherence is enforced by the loader and never drifts in the file.
export const BarLineSchema = z.object({
  t: z.number().int().nonnegative(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number(),
});
export type BarLine = z.infer<typeof BarLineSchema>;

// Per-symbol identity captured at fetch time and pinned in the fixture.
// Provider-side fields (twelveDataAlias, exchange, instrumentType, currency,
// timezone, sessionCalendar, dstHandling) are recorded so that once the
// upstream subscription lapses we can still tell which exact instrument the
// bars came from. Broker-side execution specs (pip / contract / spread) are
// intentionally NOT here — they belong to broker config and are injected into
// CachedFixtureProvider via `instrumentSpecs`.
export const SymbolMetaSchema = z.object({
  symbol: z.string(),
  twelveDataAlias: z.string(),
  exchange: z.string(),
  instrumentType: z.string(),
  currency: z.string(),
  timezone: z.string(),
  sessionCalendar: z.string(),
  dstHandling: z.string(),
  fetchedAt: z.string(),
  rawSymbolSearch: z.unknown(),
});
export type SymbolMetaFile = z.infer<typeof SymbolMetaSchema>;

export const ShardEntrySchema = z.object({
  path: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  barCount: z.number().int().nonnegative(),
  firstBarStart: z.number().int().nullable(),
  lastBarStart: z.number().int().nullable(),
  byteSizeCompressed: z.number().int().nonnegative(),
  sha256: z.string(),
});
export type ShardEntry = z.infer<typeof ShardEntrySchema>;

export const FetchWindowSchema = z.object({
  from: z.string(), // ISO date or datetime — opaque to consumer
  to: z.string(),
});
export type FetchWindow = z.infer<typeof FetchWindowSchema>;

export const ManifestSchema = z.object({
  schemaVersion: z.literal(FIXTURE_SCHEMA_VERSION),
  fixtureVersion: z.string(),
  fetchProvider: z.literal('twelvedata'),
  fetchProviderTier: z.string(),
  fetchedAtStart: z.string(),
  fetchedAtEnd: z.string(),
  intraday: FetchWindowSchema,
  dailyTail: FetchWindowSchema,
  symbols: z.array(z.string()).min(1),
  timeframes: z.object({
    intraday: z.array(z.string()).min(1),
    daily: z.array(z.string()).min(1),
  }),
  shards: z.array(ShardEntrySchema),
  credits: z.object({
    estimated: z.number().int().nonnegative(),
    spent: z.number().int().nonnegative(),
  }),
  adversarialWindowsCount: z.number().int().nonnegative(),
  git: z
    .object({
      commit: z.string().nullable(),
      dirty: z.boolean(),
    })
    .nullable(),
});
export type Manifest = z.infer<typeof ManifestSchema>;

// Adversarial windows are pre-windowed on disk — startMs/endMs include the
// ±N-min envelope around news prints (or full-day for closures). eventTsMs is
// the actual print time (for news) or the closure-period anchor (for
// holidays). The provider exposes them through getEvents() as point-in-time
// CalendarEvents using eventTsMs as the timestamp; replay code re-derives the
// FTMO ±5m blackout / 2h pre-news windows via
// buildBlackoutWindows/buildPreNewsWindows from event.timestamp per BLUEPRINT
// §11.5. Producer-internal symmetry is NOT contractual; consumers MUST NOT
// compute the print time from window bounds.
export const AdversarialWindowSchema = z.object({
  id: z.string(),
  kind: z.enum(['news', 'holiday']),
  category: z.string(),
  startMs: z.number().int(),
  endMs: z.number().int(),
  eventTsMs: z.number().int(),
  symbols: z.array(z.string()).min(1),
  impact: z.enum(['low', 'medium', 'high', 'closure']),
  notes: z.string().optional(),
});
export type AdversarialWindow = z.infer<typeof AdversarialWindowSchema>;

export const AdversarialWindowsFileSchema = z.object({
  schemaVersion: z.literal(FIXTURE_SCHEMA_VERSION),
  curatedAt: z.string(),
  source: z.string(),
  windows: z.array(AdversarialWindowSchema),
});
export type AdversarialWindowsFile = z.infer<typeof AdversarialWindowsFileSchema>;

// Convenience: ms-per-timeframe for tsEnd derivation. Mirrors the table in
// `@ankit-prop/market-data-twelvedata/src/timeframes.ts` so the provider can
// load arbitrary timeframes without an extra package dep.
export const TIMEFRAME_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

export function timeframeMs(tf: string): number | undefined {
  return TIMEFRAME_MS[tf];
}
