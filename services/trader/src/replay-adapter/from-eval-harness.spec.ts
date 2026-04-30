import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DecisionRecord } from '@ankit-prop/contracts';
import type { AccountConfig, SymbolMeta } from '@ankit-prop/eval-harness';
import { CachedFixtureProvider } from '@ankit-prop/market-data';
import { loadPersonaConfig } from '../persona-config/loader.ts';
import { runTraderReplay } from './from-eval-harness.ts';

const FIXTURE_ROOT = 'data/market-data/twelvedata/v1.0.0-2026-04-28';
const WINDOW_TO_MS = Date.parse('2026-04-28T00:00:00.000Z');
const ONE_DAY_WINDOW = {
  fromMs: Date.parse('2026-04-27T00:00:00.000Z'),
  toMs: WINDOW_TO_MS,
};

const ACCOUNT: AccountConfig = {
  accountId: 'trader-replay-spec',
  envelopeId: null,
  initialCapital: 100_000,
  phase: 'phase_1',
};

const INSTRUMENT_SPECS = {
  XAUUSD: { pipSize: 0.01, contractSize: 100, typicalSpreadPips: 15 },
};

describe('runTraderReplay', () => {
  test('writes parseable decision JSONL for at least 200 XAUUSD bars', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'trader-replay-'));
    try {
      const provider = new CachedFixtureProvider({
        rootPath: FIXTURE_ROOT,
        instrumentSpecs: INSTRUMENT_SPECS,
      });
      const persona = await loadPersonaConfig();
      const result = await runTraderReplay({
        runId: 'replay-adapter-spec',
        persona,
        provider,
        symbols: [{ symbol: 'XAUUSD', timeframe: '5m' }],
        window: ONE_DAY_WINDOW,
        account: ACCOUNT,
        symbolMetas: await symbolMetas(provider, ['XAUUSD']),
        logPath: join(tmp, 'decisions.jsonl'),
      });

      expect(result.decisions.length).toBeGreaterThanOrEqual(200);
      const lines = (await readFile(result.logPath, 'utf8')).trim().split('\n');
      expect(lines.length).toBe(result.decisions.length);
      for (const line of lines) {
        const parsed = DecisionRecord.parse(JSON.parse(line));
        expect(parsed.personaId).toBe('v_ankit_classic');
        expect(parsed.instrument).toBe('XAUUSD');
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

async function symbolMetas(
  provider: CachedFixtureProvider,
  symbols: ReadonlyArray<string>,
): Promise<SymbolMeta[]> {
  const bySymbol = new Map((await provider.listSymbols()).map((s) => [s.symbol, s]));
  return symbols.map((symbol) => {
    const meta = bySymbol.get(symbol);
    if (!meta) throw new Error(`missing test symbol meta: ${symbol}`);
    return meta;
  });
}
