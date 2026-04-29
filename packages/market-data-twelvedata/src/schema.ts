import { z } from 'zod';

export const FIXTURE_SCHEMA_VERSION = 1 as const;

export const BarLineSchema = z.object({
  t: z.number().int().nonnegative(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number(),
});
export type BarLine = z.infer<typeof BarLineSchema>;

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

export const WindowSchema = z.object({
  from: z.string(),
  to: z.string(),
});

export const ManifestSchema = z.object({
  schemaVersion: z.literal(FIXTURE_SCHEMA_VERSION),
  fixtureVersion: z.string(),
  fetchProvider: z.literal('twelvedata'),
  fetchProviderTier: z.string(),
  fetchedAtStart: z.string(),
  fetchedAtEnd: z.string(),
  intraday: WindowSchema,
  dailyTail: WindowSchema,
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
