import { join } from 'node:path';
import type { AccountConfig, SymbolMeta } from '@ankit-prop/eval-harness';
import { CachedFixtureProvider } from '@ankit-prop/market-data';
import { loadPersonaConfig } from '../persona-config/loader.ts';
import { runTraderReplay } from './from-eval-harness.ts';

const FIXTURE_ROOT = 'data/market-data/twelvedata/v1.0.0-2026-04-28';
const INSTRUMENT_SPECS = {
  XAUUSD: { pipSize: 0.01, contractSize: 100, typicalSpreadPips: 15 },
};
const DEFAULT_ACCOUNT: AccountConfig = {
  accountId: 'trader-replay-cli',
  envelopeId: null,
  initialCapital: 100_000,
  phase: 'phase_1',
};

const personaId = readArgValue('--persona') ?? 'v_ankit_classic';
const windowArg = readArgValue('--window') ?? '7d';
const runId = readArgValue('--runId') ?? `${personaId}-${windowArg}-${new Date().toISOString()}`;

if (windowArg !== '7d') {
  throw new Error(`unsupported replay window: ${windowArg}`);
}

const provider = new CachedFixtureProvider({
  rootPath: FIXTURE_ROOT,
  instrumentSpecs: INSTRUMENT_SPECS,
});
const persona = await loadPersonaConfig({ personaId });
const symbols = [{ symbol: persona.instrument, timeframe: persona.timeframe }];
const toMs = Date.parse('2026-04-28T00:00:00.000Z');
const fromMs = toMs - 7 * 24 * 60 * 60 * 1000;
const result = await runTraderReplay({
  runId,
  persona,
  provider,
  symbols,
  window: { fromMs, toMs },
  account: DEFAULT_ACCOUNT,
  symbolMetas: await symbolMetas(provider, [persona.instrument]),
  logPath: join('.dev', 'runs', runId, 'decisions.jsonl'),
});

console.log(
  `replay ${result.runId} decisions=${result.decisions.length} report=${result.report?.reportJsonPath ?? 'none'}`,
);

async function symbolMetas(
  provider: CachedFixtureProvider,
  symbols: ReadonlyArray<string>,
): Promise<SymbolMeta[]> {
  const bySymbol = new Map((await provider.listSymbols()).map((symbol) => [symbol.symbol, symbol]));
  return symbols.map((symbol) => {
    const meta = bySymbol.get(symbol);
    if (!meta) throw new Error(`missing symbol meta: ${symbol}`);
    return meta;
  });
}

function readArgValue(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index === -1 ? undefined : Bun.argv[index + 1];
}
