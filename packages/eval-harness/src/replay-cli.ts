import { join } from 'node:path';
import {
  CachedFixtureProvider,
  type InstrumentSpec,
  type Manifest,
  ManifestSchema,
} from '@ankit-prop/market-data';
import { replayWithProvider } from './replay-driver.ts';
import { NOOP_V1, OPEN_HOLD_CLOSE_V1 } from './replay-strategies.ts';
import type {
  AccountConfig,
  BarStrategy,
  ClosedTrade,
  EvalResult,
  FtmoBreach,
  SymbolMeta,
} from './types.ts';

const ONE_DAY_MS = 24 * 60 * 60_000;

// Pinned-to-cTrader-defaults placeholders; replace with broker-config once it lands.
export const REPLAY_INSTRUMENT_SPECS: Record<string, InstrumentSpec> = {
  XAUUSD: { pipSize: 0.01, contractSize: 100, typicalSpreadPips: 15 },
  NAS100: { pipSize: 0.1, contractSize: 1, typicalSpreadPips: 10 },
};

const REPLAY_ACCOUNT: AccountConfig = {
  accountId: 'fixture-replay',
  envelopeId: null,
  initialCapital: 100_000,
  phase: 'phase_1',
};

const STRATEGIES: Record<string, BarStrategy> = {
  [NOOP_V1.name]: NOOP_V1,
  [OPEN_HOLD_CLOSE_V1.name]: OPEN_HOLD_CLOSE_V1,
};

const SYMBOL_SETS: Record<string, ReadonlyArray<{ symbol: string; timeframe: string }>> = {
  xauusd_5m: [{ symbol: 'XAUUSD', timeframe: '5m' }],
  // NAS100 intraday shards are intentionally sparse in v1 fixtures; a future fetcher pass fills them.
  nas100_5m: [{ symbol: 'NAS100', timeframe: '5m' }],
  xauusd_nas100_5m: [
    { symbol: 'XAUUSD', timeframe: '5m' },
    { symbol: 'NAS100', timeframe: '5m' },
  ],
};

export type ReplaySnapshot = {
  strategyVersion: string;
  fixtureVersion: string;
  windowFromMs: number;
  windowToMs: number;
  symbolSet: string;
  tradeCount: number;
  breachKinds: string[];
  metrics: EvalResult['metrics'];
  tradesHash: string;
  breachesHash: string;
};

export type ReplaySnapshotInput = {
  fixtureRoot: string;
  strategyId: string;
  symbolSetId: string;
  windowMode: 'smoke' | 'full';
};

type ReplayCliOptions = ReplaySnapshotInput & {
  out?: string;
};

export async function runReplaySnapshot(input: ReplaySnapshotInput): Promise<ReplaySnapshot> {
  const manifest = await loadManifest(input.fixtureRoot);
  const strategy = mustGet(STRATEGIES, input.strategyId, 'strategy');
  const symbols = mustGet(SYMBOL_SETS, input.symbolSetId, 'symbol-set');
  const window = resolveWindow(manifest, input.windowMode);
  const provider = new CachedFixtureProvider({
    rootPath: input.fixtureRoot,
    instrumentSpecs: REPLAY_INSTRUMENT_SPECS,
  });
  const symbolMetas = await resolveSymbolMetas(provider, symbols);
  const result = await replayWithProvider({
    strategyVersion: strategy.name,
    account: REPLAY_ACCOUNT,
    provider,
    symbols,
    window,
    symbolMetas,
    strategy,
  });
  return snapshotFromEvalResult({
    result,
    strategyVersion: strategy.name,
    fixtureVersion: manifest.fixtureVersion,
    windowFromMs: window.fromMs,
    windowToMs: window.toMs,
    symbolSet: input.symbolSetId,
  });
}

export function snapshotFromEvalResult(input: {
  result: EvalResult;
  strategyVersion: string;
  fixtureVersion: string;
  windowFromMs: number;
  windowToMs: number;
  symbolSet: string;
}): ReplaySnapshot {
  const trades = replayedTrades(input.result);
  const breaches = [...input.result.ftmoBreaches].sort(compareBreaches);
  return {
    strategyVersion: input.strategyVersion,
    fixtureVersion: input.fixtureVersion,
    windowFromMs: input.windowFromMs,
    windowToMs: input.windowToMs,
    symbolSet: input.symbolSet,
    tradeCount: trades.length,
    breachKinds: [...new Set(breaches.map((b) => b.kind))].sort(),
    metrics: input.result.metrics,
    tradesHash: sha256(canonicalStringify(trades)),
    breachesHash: sha256(canonicalStringify(breaches)),
  };
}

export function canonicalStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`cannot canonicalize non-finite number: ${value}`);
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalStringify(v ?? null)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`)
      .join(',')}}`;
  }
  throw new Error(`cannot canonicalize value of type ${typeof value}`);
}

export async function runReplayCli(argv = Bun.argv.slice(2)): Promise<ReplaySnapshot> {
  const opts = parseArgs(argv);
  const snapshot = await runReplaySnapshot(opts);
  if (opts.out) {
    await Bun.write(opts.out, `${canonicalStringify(snapshot)}\n`);
  }
  const summary = `replay ${snapshot.strategyVersion} ${snapshot.symbolSet} trades=${snapshot.tradeCount} breaches=${snapshot.breachKinds.length} window=${new Date(
    snapshot.windowFromMs,
  ).toISOString()}..${new Date(snapshot.windowToMs).toISOString()}${opts.out ? ` out=${opts.out}` : ''}\n`;
  await Bun.write(Bun.stdout, summary);
  return snapshot;
}

function parseArgs(argv: ReadonlyArray<string>): ReplayCliOptions {
  const opts: Partial<ReplayCliOptions> = {
    strategyId: NOOP_V1.name,
    symbolSetId: 'xauusd_5m',
    windowMode: 'smoke',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--fixture-root') opts.fixtureRoot = requireValue(argv, ++i, arg);
    else if (arg === '--out') opts.out = requireValue(argv, ++i, arg);
    else if (arg === '--strategy') opts.strategyId = requireValue(argv, ++i, arg);
    else if (arg === '--symbol-set') opts.symbolSetId = requireValue(argv, ++i, arg);
    else if (arg === '--smoke') opts.windowMode = 'smoke';
    else if (arg === '--full') opts.windowMode = 'full';
    else throw new Error(`unknown replay-cli flag: ${arg}`);
  }
  if (!opts.fixtureRoot) throw new Error('--fixture-root <path> is required');
  return opts as ReplayCliOptions;
}

function requireValue(argv: ReadonlyArray<string>, index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

async function loadManifest(fixtureRoot: string): Promise<Manifest> {
  const raw = JSON.parse(await Bun.file(join(fixtureRoot, 'manifest.json')).text());
  return ManifestSchema.parse(raw);
}

function resolveWindow(
  manifest: Manifest,
  mode: 'smoke' | 'full',
): { fromMs: number; toMs: number } {
  const fullFromMs = Date.parse(manifest.intraday.from);
  const fullToMs = Date.parse(manifest.intraday.to);
  if (!Number.isFinite(fullFromMs) || !Number.isFinite(fullToMs)) {
    throw new Error(
      `manifest intraday window is not parseable: ${manifest.intraday.from}..${manifest.intraday.to}`,
    );
  }
  if (mode === 'full') return { fromMs: fullFromMs, toMs: fullToMs };
  return { fromMs: fullToMs - 7 * ONE_DAY_MS, toMs: fullToMs };
}

async function resolveSymbolMetas(
  provider: CachedFixtureProvider,
  symbols: ReadonlyArray<{ symbol: string }>,
): Promise<SymbolMeta[]> {
  const bySymbol = new Map((await provider.listSymbols()).map((s) => [s.symbol, s]));
  return symbols.map((s) => {
    const meta = bySymbol.get(s.symbol);
    if (!meta) throw new Error(`fixture provider does not expose symbol meta for ${s.symbol}`);
    return meta;
  });
}

function replayedTrades(result: EvalResult): ClosedTrade[] {
  const value = result.diagnostics.replayedTrades;
  return Array.isArray(value) ? (value as ClosedTrade[]) : [];
}

function compareBreaches(a: FtmoBreach, b: FtmoBreach): number {
  return (
    a.kind.localeCompare(b.kind) ||
    a.scope.localeCompare(b.scope) ||
    a.occurredAt.localeCompare(b.occurredAt) ||
    a.message.localeCompare(b.message)
  );
}

function sha256(value: string): string {
  return new Bun.CryptoHasher('sha256').update(value).digest('hex');
}

function mustGet<T>(record: Record<string, T>, key: string, label: string): T {
  const value = record[key];
  if (value === undefined) throw new Error(`unknown ${label}: ${key}`);
  return value;
}

if (import.meta.main) {
  runReplayCli().catch(async (err) => {
    await Bun.write(Bun.stderr, `${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
