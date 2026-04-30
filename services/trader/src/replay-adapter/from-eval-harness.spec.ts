import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DecisionRecord, type PersonaConfig } from '@ankit-prop/contracts';
import type { AccountConfig, SymbolMeta } from '@ankit-prop/eval-harness';
import type {
  Bar,
  CalendarEvent,
  IMarketDataProvider,
  MarketDataQuery,
  SymbolAvailability,
} from '@ankit-prop/market-data';
import type { AnalystGenerator } from '../analyst/index.ts';
import { loadPersonaConfig } from '../persona-config/loader.ts';
import { runTraderReplay } from './from-eval-harness.ts';

const WINDOW_FROM_MS = Date.parse('2026-04-27T12:00:00.000Z');
const WINDOW_TO_MS = Date.parse('2026-04-27T13:00:00.000Z');
const ONE_DAY_WINDOW = {
  fromMs: WINDOW_FROM_MS,
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
  test('writes parseable decision JSONL through default v_ankit_classic deps', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'trader-replay-'));
    try {
      const bars = barsWithRepeatedLongSignals();
      const provider = new StaticMarketDataProvider(bars);
      const persona = await loadPersonaConfig();
      const result = await runTraderReplay({
        runId: 'replay-adapter-spec',
        persona,
        provider,
        symbols: [{ symbol: 'XAUUSD', timeframe: '5m' }],
        window: ONE_DAY_WINDOW,
        account: ACCOUNT,
        symbolMetas: await provider.listSymbols(),
        logPath: join(tmp, 'decisions.jsonl'),
        reflectAtEnd: false,
        analystGenerator: fixtureAnalystGenerator,
      });

      expect(result.decisions.length).toBe(bars.length);
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

  test('holds repeated same-side signals after the first submitted OPEN', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'trader-replay-'));
    try {
      const provider = new StaticMarketDataProvider(barsWithRepeatedLongSignals());
      const persona = await loadPersonaConfig();
      const result = await runTraderReplay({
        runId: 'replay-adapter-repeated-open-spec',
        persona,
        provider,
        symbols: [{ symbol: 'XAUUSD', timeframe: '5m' }],
        window: ONE_DAY_WINDOW,
        account: ACCOUNT,
        symbolMetas: await provider.listSymbols(),
        logPath: join(tmp, 'decisions.jsonl'),
        reflectAtEnd: false,
        analystGenerator: fixtureAnalystGenerator,
      });

      const submittedOpens = result.decisions.filter(
        (decision) =>
          decision.traderOutput.action === 'OPEN' &&
          decision.gatewayDecision?.status === 'submitted',
      );
      const alignedHolds = result.decisions.filter(
        (decision) =>
          decision.traderOutput.action === 'HOLD' &&
          decision.traderOutput.reason === 'existing_position_aligned',
      );

      expect(submittedOpens).toHaveLength(1);
      expect(alignedHolds.length).toBeGreaterThanOrEqual(1);
      for (const hold of alignedHolds) {
        expect(hold.judgeOutput?.verdict).toBe('REJECT');
        expect(hold.judgeOutput?.reason).toBe('trader_hold');
        expect(hold.judgeOutput?.rejectedRules).toContain('confluence_too_weak');
        expect(hold.gatewayDecision?.status).toBe('not_submitted');
        if (hold.gatewayDecision?.status === 'not_submitted') {
          expect(hold.gatewayDecision.reason).toBe('judge_reject');
        }
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('clears submitted CLOSE state and resets risk budget on UTC day rollover', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'trader-replay-'));
    try {
      const bars = barsAcrossUtcDayForCloseThenReopen();
      const provider = new StaticMarketDataProvider(bars);
      const persona = personaWithAllDaySignalWindow(await loadPersonaConfig());
      const result = await runTraderReplay({
        runId: 'replay-adapter-close-reopen-spec',
        persona,
        provider,
        symbols: [{ symbol: 'XAUUSD', timeframe: '5m' }],
        window: {
          fromMs: Date.parse('2026-04-27T23:00:00.000Z'),
          toMs: Date.parse('2026-04-28T00:30:00.000Z'),
        },
        account: ACCOUNT,
        symbolMetas: await provider.listSymbols(),
        logPath: join(tmp, 'decisions.jsonl'),
        reflectAtEnd: false,
        analystGenerator: analystGeneratorForBiases([
          'long',
          'long',
          'long',
          'long',
          'long',
          'long',
          'short',
          'short',
        ]),
      });

      const submittedActions = result.decisions
        .filter((decision) => decision.gatewayDecision?.status === 'submitted')
        .map((decision) => decision.traderOutput.action);
      expect(submittedActions).toEqual(['OPEN', 'CLOSE', 'OPEN']);
      const submittedReopen = result.decisions.find(
        (decision) =>
          decision.traderOutput.action === 'OPEN' &&
          decision.gatewayDecision?.status === 'submitted' &&
          decision.barClosedAt.startsWith('2026-04-28'),
      );
      expect(submittedReopen?.judgeOutput?.verdict).toBe('APPROVE');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

const fixtureAnalystGenerator = analystGeneratorForBiases(['long']);

function analystGeneratorForBiases(
  biases: ReadonlyArray<'long' | 'short' | 'neutral'>,
): AnalystGenerator {
  let index = 0;
  return async () => {
    const bias = biases[Math.min(index, biases.length - 1)];
    index += 1;
    if (bias === undefined) throw new Error('bias sequence must not be empty');
    return {
      object: {
        thesis: 'Fixture thesis; deterministic confluence fields are filled by the analyst.',
        bias,
        confidence: 1,
        confluenceScore: 100,
        keyLevels: [{ name: 'fixture support', price: 100, timeframe: '5m' }],
        regimeLabel: 'A_session_break',
        regimeNote: 'fixture',
        cacheStats: {
          inputCachedTokens: 0,
          inputFreshTokens: 0,
          inputCacheWriteTokens: 0,
          outputTokens: 0,
          thinkingTokens: 0,
        },
      },
      usage: {
        inputTokens: 0,
        inputTokenDetails: {
          noCacheTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        outputTokens: 0,
        outputTokenDetails: {
          textTokens: 0,
          reasoningTokens: 0,
        },
        totalTokens: 0,
      },
    };
  };
}

function barsWithRepeatedLongSignals(): Bar[] {
  return Array.from({ length: 8 }, (_, index) => {
    const tsStart = WINDOW_FROM_MS + index * 5 * 60 * 1000;
    const close = 100 + index * 2;
    return {
      symbol: 'XAUUSD',
      timeframe: '5m',
      tsStart,
      tsEnd: tsStart + 5 * 60 * 1000,
      open: close - 1,
      high: close + 1,
      low: close - 2,
      close,
      volume: 1000 + index,
    };
  });
}

function barsAcrossUtcDayForCloseThenReopen(): Bar[] {
  const starts = [
    '2026-04-27T23:00:00.000Z',
    '2026-04-27T23:05:00.000Z',
    '2026-04-27T23:10:00.000Z',
    '2026-04-27T23:15:00.000Z',
    '2026-04-27T23:20:00.000Z',
    '2026-04-27T23:25:00.000Z',
    '2026-04-27T23:50:00.000Z',
    '2026-04-28T00:05:00.000Z',
  ];
  return starts.map((start, index) => {
    const tsStart = Date.parse(start);
    const close = 100 + index * 3;
    return {
      symbol: 'XAUUSD',
      timeframe: '5m',
      tsStart,
      tsEnd: tsStart + 5 * 60 * 1000,
      open: close - 2,
      high: close + 1,
      low: close - 3,
      close,
      volume: 1000 + index,
    };
  });
}

function personaWithAllDaySignalWindow(persona: PersonaConfig): PersonaConfig {
  return {
    ...persona,
    windowPrague: {
      ...persona.windowPrague,
      preSessionStart: '00:00',
      preSessionEnd: '23:59',
      activeStart: '00:00',
      activeEnd: '23:59',
    },
    families: {
      ...persona.families,
      sessionBreakout: {
        ...persona.families.sessionBreakout,
        start: '00:00',
        end: '23:59',
      },
    },
  };
}

class StaticMarketDataProvider implements IMarketDataProvider {
  readonly #symbols: SymbolMeta[] = [
    {
      symbol: 'XAUUSD',
      ...INSTRUMENT_SPECS.XAUUSD,
    },
  ];

  constructor(private readonly bars: ReadonlyArray<Bar>) {}

  async listSymbols(): Promise<readonly SymbolMeta[]> {
    return this.#symbols;
  }

  async resolveSymbol(symbol: string): Promise<SymbolMeta | undefined> {
    return this.#symbols.find((meta) => meta.symbol === symbol);
  }

  async listAvailability(): Promise<readonly SymbolAvailability[]> {
    return [
      {
        symbol: 'XAUUSD',
        timeframes: ['5m'],
      },
    ];
  }

  async getBars(query: MarketDataQuery): Promise<readonly Bar[]> {
    return this.bars.filter(
      (bar) =>
        bar.symbol === query.symbol &&
        bar.timeframe === query.timeframe &&
        bar.tsStart >= query.fromMs &&
        bar.tsStart < query.toMs,
    );
  }

  async getEvents(): Promise<readonly CalendarEvent[]> {
    return [];
  }
}
