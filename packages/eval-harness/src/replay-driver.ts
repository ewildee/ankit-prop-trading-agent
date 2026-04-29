import type { IMarketDataProvider } from '@ankit-prop/market-data';
import { backtest } from './backtest.ts';
import type { AccountConfig, Bar, BarStrategy, EvalResult, SymbolMeta } from './types.ts';

export type ReplayInput = {
  strategyVersion: string;
  account: AccountConfig;
  provider: IMarketDataProvider;
  symbols: ReadonlyArray<{ symbol: string; timeframe: string }>;
  window: { fromMs: number; toMs: number };
  symbolMetas: ReadonlyArray<SymbolMeta>;
  strategy: BarStrategy;
};

// Thrown when a requested symbol has no matching SymbolMeta. The simulator
// silently skips bars whose symbol is absent from the metas map, which would
// fail-open: a caller asking for XAUUSD with `symbolMetas: []` would get a
// clean zero-trade EvalResult instead of an error. Replay must fail closed.
export class ReplaySymbolMetaMissing extends Error {
  readonly missingSymbols: ReadonlyArray<string>;
  constructor(missingSymbols: ReadonlyArray<string>) {
    super(`replay-driver: missing SymbolMeta for requested symbols: ${missingSymbols.join(', ')}`);
    this.name = 'ReplaySymbolMetaMissing';
    this.missingSymbols = missingSymbols;
  }
}

// Thrown when a requested symbol has a SymbolMeta whose broker execution
// fields are missing/zero/non-finite. CachedFixtureProvider returns
// `pipSize: 0`, `contractSize: 0`, `typicalSpreadPips: 0` when constructed
// without `instrumentSpecs`; backtest() then runs but produces a vacuous
// `realizedPnl: 0`, `initialRisk: 0`, no breaches result regardless of bars.
// Replay must fail closed on that path too.
export type InvalidSymbolMetaFinding = {
  readonly symbol: string;
  readonly invalidFields: ReadonlyArray<'pipSize' | 'contractSize' | 'typicalSpreadPips'>;
};
export class ReplaySymbolMetaInvalid extends Error {
  readonly findings: ReadonlyArray<InvalidSymbolMetaFinding>;
  constructor(findings: ReadonlyArray<InvalidSymbolMetaFinding>) {
    const summary = findings.map((f) => `${f.symbol}=[${f.invalidFields.join(', ')}]`).join('; ');
    super(
      `replay-driver: SymbolMeta has invalid broker execution fields (must be finite > 0): ${summary}`,
    );
    this.name = 'ReplaySymbolMetaInvalid';
    this.findings = findings;
  }
}

type ReplayPreparedStrategy = BarStrategy & {
  prepareReplay?: (bars: ReadonlyArray<Bar>) => BarStrategy;
};

export async function replayWithProvider(input: ReplayInput): Promise<EvalResult> {
  assertSymbolMetaCoverage(input);
  assertSymbolMetaBrokerFields(input);

  const barSets = await Promise.all(
    input.symbols.map(async (s) => ({
      symbol: s.symbol,
      timeframe: s.timeframe,
      bars: await input.provider.getBars({
        symbol: s.symbol,
        timeframe: s.timeframe,
        fromMs: input.window.fromMs,
        toMs: input.window.toMs,
      }),
    })),
  );
  const bars = mergeBars(barSets);
  const events =
    input.provider.getEvents === undefined
      ? []
      : await input.provider.getEvents({ fromMs: input.window.fromMs, toMs: input.window.toMs });
  const strategy = prepareStrategy(input.strategy, bars);

  return backtest({
    strategyVersion: input.strategyVersion,
    account: input.account,
    bars,
    symbols: input.symbolMetas,
    events,
    strategy,
  });
}

function assertSymbolMetaCoverage(input: ReplayInput): void {
  const metas = new Set(input.symbolMetas.map((m) => m.symbol));
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const s of input.symbols) {
    if (seen.has(s.symbol)) continue;
    seen.add(s.symbol);
    if (!metas.has(s.symbol)) missing.push(s.symbol);
  }
  if (missing.length > 0) throw new ReplaySymbolMetaMissing(missing);
}

function assertSymbolMetaBrokerFields(input: ReplayInput): void {
  const requested = new Set(input.symbols.map((s) => s.symbol));
  const findings: InvalidSymbolMetaFinding[] = [];
  for (const meta of input.symbolMetas) {
    if (!requested.has(meta.symbol)) continue;
    const invalidFields: Array<'pipSize' | 'contractSize' | 'typicalSpreadPips'> = [];
    if (!isFinitePositive(meta.pipSize)) invalidFields.push('pipSize');
    if (!isFinitePositive(meta.contractSize)) invalidFields.push('contractSize');
    if (!isFinitePositive(meta.typicalSpreadPips)) invalidFields.push('typicalSpreadPips');
    if (invalidFields.length > 0) findings.push({ symbol: meta.symbol, invalidFields });
  }
  if (findings.length > 0) throw new ReplaySymbolMetaInvalid(findings);
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function mergeBars(
  barSets: ReadonlyArray<{
    symbol: string;
    timeframe: string;
    bars: readonly Bar[];
  }>,
): Bar[] {
  const cursors = barSets.map(() => 0);
  const merged: Bar[] = [];

  while (true) {
    let bestSet = -1;
    let bestBar: Bar | undefined;
    for (let i = 0; i < barSets.length; i++) {
      const candidate = barSets[i]?.bars[cursors[i] ?? 0];
      if (!candidate) continue;
      if (!bestBar || compareBars(candidate, bestBar) < 0) {
        bestSet = i;
        bestBar = candidate;
      }
    }
    if (!bestBar || bestSet === -1) return merged;
    merged.push(bestBar);
    cursors[bestSet] = (cursors[bestSet] ?? 0) + 1;
  }
}

function compareBars(a: Bar, b: Bar): number {
  return (
    a.tsStart - b.tsStart ||
    a.symbol.localeCompare(b.symbol) ||
    a.timeframe.localeCompare(b.timeframe)
  );
}

function prepareStrategy(strategy: BarStrategy, bars: ReadonlyArray<Bar>): BarStrategy {
  const replayAware = strategy as ReplayPreparedStrategy;
  return replayAware.prepareReplay?.(bars) ?? strategy;
}
