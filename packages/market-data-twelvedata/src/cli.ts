#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { buildCuratedAdversarialWindows } from './adversarial-windows.ts';
import { FetchOrchestrator } from './fetcher.ts';
import { FixtureStore } from './fixture-store.ts';
import { type FetchPlan, formatPlan, planFetch } from './planner.ts';
import { CreditRateLimiter } from './rate-limiter.ts';
import { CANONICAL_SYMBOLS, type CanonicalSymbol, isCanonicalSymbol } from './symbols.ts';
import {
  DAILY_TIMEFRAMES,
  INTRADAY_TIMEFRAMES,
  isTimeframe,
  type Timeframe,
} from './timeframes.ts';
import { TwelveDataClient } from './twelve-data-client.ts';

const DEFAULT_INTRADAY_MONTHS = 3;
const DEFAULT_DAILY_TAIL_MONTHS = 6;
const DEFAULT_TIER_CREDITS_PER_MIN = 55;

type CliFlags = {
  symbols: ReadonlyArray<CanonicalSymbol>;
  intradayTimeframes: ReadonlyArray<Timeframe>;
  dailyTimeframes: ReadonlyArray<Timeframe>;
  intradayFromMs: number;
  intradayToMs: number;
  dailyFromMs: number;
  dailyToMs: number;
  fixtureVersion: string;
  rootDir: string;
  tierCreditsPerMinute: number;
  apply: boolean;
};

export type CliRunResult = {
  plan: FetchPlan;
  applied: boolean;
};

export async function runCli(argv: ReadonlyArray<string>): Promise<CliRunResult> {
  const sub = argv[0] ?? 'plan';
  if (sub === 'help' || sub === '--help' || sub === '-h') {
    printHelp();
    return { plan: emptyPlan(), applied: false };
  }
  const flags = parseFlags(argv.slice(1), sub);
  const plan = planFetch(flags);
  console.log(formatPlan(plan));
  if (sub === 'plan') {
    console.log('\n[plan] dry-run only — re-run with `fetch --apply` to execute.');
    return { plan, applied: false };
  }
  if (sub !== 'fetch') {
    throw new Error(`unknown subcommand: ${sub}`);
  }
  if (!flags.apply) {
    console.log('\n[fetch] dry-run (default). Pass --apply to actually call TwelveData.');
    return { plan, applied: false };
  }
  const apiKey = process.env['TWELVEDATA_API_KEY'];
  if (!apiKey) throw new Error('TWELVEDATA_API_KEY env var is required for --apply');
  const limiter = new CreditRateLimiter({ creditsPerMinute: flags.tierCreditsPerMinute });
  const client = new TwelveDataClient({ apiKey, rateLimiter: limiter });
  const store = new FixtureStore({ rootDir: flags.rootDir });
  const orchestrator = new FetchOrchestrator(
    {
      client,
      store,
      fixtureVersion: flags.fixtureVersion,
      fetchProviderTier: 'grow',
      estimatedCredits: plan.totalCredits,
      gitCommit: process.env['GIT_COMMIT'] ?? null,
      gitDirty: process.env['GIT_DIRTY'] === '1',
      log: (m) => console.log(m),
    },
    flags,
  );
  const result = await orchestrator.run();
  const adversarial = buildCuratedAdversarialWindows(new Date().toISOString().slice(0, 10));
  await store.writeAdversarialWindows(adversarial);
  const manifest = await store.readManifest();
  if (manifest) {
    manifest.adversarialWindowsCount = adversarial.windows.length;
    await store.writeManifest(manifest);
  }
  console.log(
    `\n[fetch] complete. credits spent=${result.creditsSpent} shards=${result.shards.length}`,
  );
  return { plan, applied: true };
}

function emptyPlan(): FetchPlan {
  return {
    shards: [],
    symbolSearchCalls: 0,
    totalCalls: 0,
    totalCredits: 0,
    totalEstimatedBars: 0,
    totalEstimatedBytesCompressed: 0,
  };
}

function parseFlags(args: ReadonlyArray<string>, sub: string): CliFlags {
  const { values } = parseArgs({
    args: [...args],
    options: {
      symbols: { type: 'string' },
      'intraday-timeframes': { type: 'string' },
      'daily-timeframes': { type: 'string' },
      'intraday-from': { type: 'string' },
      'intraday-to': { type: 'string' },
      'daily-from': { type: 'string' },
      'daily-to': { type: 'string' },
      'fixture-version': { type: 'string' },
      'root-dir': { type: 'string' },
      'tier-cpm': { type: 'string' },
      apply: { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const symbols = parseList(values.symbols, [...CANONICAL_SYMBOLS]).map((s) => {
    if (!isCanonicalSymbol(s)) throw new Error(`unknown symbol: ${s}`);
    return s;
  });
  const intradayTimeframes = parseList(values['intraday-timeframes'], [...INTRADAY_TIMEFRAMES]).map(
    (s) => {
      if (!isTimeframe(s)) throw new Error(`unknown timeframe: ${s}`);
      return s;
    },
  );
  const dailyTimeframes = parseList(values['daily-timeframes'], [...DAILY_TIMEFRAMES]).map((s) => {
    if (!isTimeframe(s)) throw new Error(`unknown timeframe: ${s}`);
    return s;
  });
  const todayUtc = startOfUtcDay(Date.now());
  const intradayToMs = parseDate(values['intraday-to']) ?? todayUtc;
  const intradayFromMs =
    parseDate(values['intraday-from']) ?? subtractMonths(intradayToMs, DEFAULT_INTRADAY_MONTHS);
  const dailyToMs = parseDate(values['daily-to']) ?? intradayToMs;
  const dailyFromMs =
    parseDate(values['daily-from']) ?? subtractMonths(dailyToMs, DEFAULT_DAILY_TAIL_MONTHS);
  const fixtureVersion =
    values['fixture-version'] ?? `v1.0.0-${new Date(intradayToMs).toISOString().slice(0, 10)}`;
  const rootDir = values['root-dir'] ?? `data/market-data/twelvedata/${fixtureVersion}`;
  const tierCreditsPerMinute = values['tier-cpm']
    ? Number(values['tier-cpm'])
    : DEFAULT_TIER_CREDITS_PER_MIN;
  const apply = sub === 'fetch' && values.apply === true;
  return {
    symbols,
    intradayTimeframes,
    dailyTimeframes,
    intradayFromMs,
    intradayToMs,
    dailyFromMs,
    dailyToMs,
    fixtureVersion,
    rootDir,
    tierCreditsPerMinute,
    apply,
  };
}

function parseList(raw: string | undefined, fallback: string[]): string[] {
  if (!raw || raw.trim() === '') return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseDate(s: string | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s.length === 10 ? `${s}T00:00:00Z` : s);
  if (Number.isNaN(t)) throw new Error(`invalid date: ${s}`);
  return t;
}

function startOfUtcDay(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function subtractMonths(ms: number, months: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, d.getUTCDate());
}

function printHelp(): void {
  console.log(`td-fetch — TwelveData historical-bars fetch & cache (ANKA-68)

USAGE
  bun run --cwd packages/market-data-twelvedata td-fetch <plan|fetch> [flags]

SUBCOMMANDS
  plan              print fetch plan (calls, credits, byte estimate); never hits API
  fetch             dry-run by default; add --apply to actually call TwelveData

FLAGS (defaults match BLUEPRINT/plan rev 2)
  --symbols=NAS100,XAUUSD
  --intraday-timeframes=1m,5m,15m,1h
  --daily-timeframes=1d
  --intraday-from=YYYY-MM-DD     (default: today − 3 months UTC)
  --intraday-to=YYYY-MM-DD       (default: today UTC)
  --daily-from=YYYY-MM-DD        (default: today − 6 months UTC)
  --daily-to=YYYY-MM-DD          (default: today UTC)
  --fixture-version=v1.0.0-YYYY-MM-DD
  --root-dir=data/market-data/twelvedata/<fixture-version>
  --tier-cpm=55                  (Grow tier credit-per-minute ceiling)
  --apply                        opt-in flag for fetch subcommand

ENV
  TWELVEDATA_API_KEY             required for fetch --apply
  GIT_COMMIT, GIT_DIRTY=1        optional, recorded in manifest
`);
}

if (import.meta.main) {
  runCli(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? `ERROR: ${err.message}` : `ERROR: ${String(err)}`);
    process.exit(1);
  });
}
