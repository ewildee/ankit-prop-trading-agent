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
      const persona = await loadReplayFixturePersona();
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
      const persona = await loadReplayFixturePersona();
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

  test('keeps the daily risk budget across UTC midnight within one Prague day and resets at the Prague boundary', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'trader-replay-'));
    try {
      const bars = barsAcrossPragueDayForCloseThenReopen();
      const provider = new StaticMarketDataProvider(bars);
      const persona = personaWithAllDaySignalWindow(await loadReplayFixturePersona());
      const result = await runTraderReplay({
        runId: 'replay-adapter-prague-day-spec',
        persona,
        provider,
        symbols: [{ symbol: 'XAUUSD', timeframe: '5m' }],
        window: {
          fromMs: Date.parse('2026-04-27T22:00:00.000Z'),
          toMs: Date.parse('2026-04-28T22:30:00.000Z'),
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
          'short',
          'short',
        ]),
      });

      // BLUEPRINT §0.2 / §8.3: replay risk-day bucket follows Europe/Prague,
      // not UTC. CEST = UTC+2 in late April 2026, so Prague midnight for day-29
      // lands at 2026-04-28T22:00:00.000Z; the UTC day rollover at
      // 2026-04-28T00:00:00.000Z is *inside* Prague day-28 and must NOT reset
      // the daily risk budget.
      const submittedActions = result.decisions
        .filter((decision) => decision.gatewayDecision?.status === 'submitted')
        .map((decision) => decision.traderOutput.action);
      expect(submittedActions).toEqual(['OPEN', 'CLOSE', 'OPEN']);

      // Same Prague day-28 as the OPEN/CLOSE pair; daily budget exhausted, so
      // Trader still emits OPEN but Judge rejects on `daily_budget_insufficient`.
      const sameDayLatePragueBar = result.decisions.find((decision) =>
        decision.barClosedAt.startsWith('2026-04-27T23:50'),
      );
      expect(sameDayLatePragueBar?.traderOutput.action).toBe('OPEN');
      expect(sameDayLatePragueBar?.judgeOutput?.verdict).toBe('REJECT');
      expect(sameDayLatePragueBar?.judgeOutput?.rejectedRules).toContain(
        'daily_budget_insufficient',
      );
      expect(sameDayLatePragueBar?.gatewayDecision?.status).toBe('not_submitted');
      if (sameDayLatePragueBar?.gatewayDecision?.status === 'not_submitted') {
        expect(sameDayLatePragueBar.gatewayDecision.reason).toBe('judge_reject');
      }

      // Past UTC midnight but still Prague day-28 — would have reset under the
      // old UTC bucketing; under Prague bucketing it must still reject.
      const utcMidnightCrossSamePragueBar = result.decisions.find((decision) =>
        decision.barClosedAt.startsWith('2026-04-28T00:05'),
      );
      expect(utcMidnightCrossSamePragueBar?.traderOutput.action).toBe('OPEN');
      expect(utcMidnightCrossSamePragueBar?.judgeOutput?.verdict).toBe('REJECT');
      expect(utcMidnightCrossSamePragueBar?.judgeOutput?.rejectedRules).toContain(
        'daily_budget_insufficient',
      );
      expect(utcMidnightCrossSamePragueBar?.gatewayDecision?.status).toBe('not_submitted');

      // Past Prague midnight (2026-04-28T22:00:00.000Z UTC = 00:00 Prague day-29):
      // bucket flips, budget resets, Judge approves the fresh OPEN.
      const submittedReopen = result.decisions.find(
        (decision) =>
          decision.traderOutput.action === 'OPEN' &&
          decision.gatewayDecision?.status === 'submitted' &&
          decision.barClosedAt.startsWith('2026-04-28T22:'),
      );
      expect(submittedReopen).toBeDefined();
      expect(submittedReopen?.judgeOutput?.verdict).toBe('APPROVE');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('threads replay calendar events into judge input and gateway news rails', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'trader-replay-'));
    try {
      const bars = barsWithRepeatedLongSignals();
      const firstActionableEventTs = Date.parse('2026-04-27T12:35:00.000Z');
      const provider = new StaticMarketDataProvider(bars, [
        {
          id: 'fomc-fixture',
          timestamp: firstActionableEventTs,
          symbols: ['XAUUSD'],
          impact: 'high',
          restricted: true,
        },
      ]);
      const persona = await loadReplayFixturePersona();
      const result = await runTraderReplay({
        runId: 'replay-adapter-calendar-spec',
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

      const railBlocked = result.decisions.find(
        (decision) =>
          decision.gatewayDecision?.status === 'not_submitted' &&
          decision.gatewayDecision.reason === 'rail_block',
      );
      expect(railBlocked?.judgeOutput?.rejectedRules).toContain('calendar_event_proximity');
      expect(railBlocked?.gatewayDecision?.status).toBe('not_submitted');
      if (railBlocked?.gatewayDecision?.status === 'not_submitted') {
        expect(railBlocked.gatewayDecision.reason).toBe('rail_block');
        expect(railBlocked.gatewayDecision.railVerdict?.decisions).toContainEqual(
          expect.objectContaining({
            rail: 'news_blackout_5m',
            outcome: 'reject',
          }),
        );
      }
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

function barsAcrossPragueDayForCloseThenReopen(): Bar[] {
  // Six contiguous 5m bars at the start of Prague day-28 (22:25Z..22:50Z UTC =
  // 00:25..00:50 Prague day-28) bootstrap the deterministic regime/confluence
  // path so the analyst eventually emits enough confidence to OPEN. The
  // remaining bars anchor specific Prague-day assertions:
  //   - 23:40Z UTC -> 01:40 Prague day-28: short bias closes the long.
  //   - 23:45Z UTC -> closes at 23:50Z (reviewer's anchor): same Prague day-28,
  //     daily budget exhausted; Judge must reject `daily_budget_insufficient`.
  //   - 00:00Z UTC -> closes at 00:05Z next day (reviewer's anchor): past UTC
  //     midnight but still Prague day-28; under UTC bucketing this would have
  //     reset, under Prague bucketing it must still reject.
  //   - 22:00Z next day -> closes at 22:05Z = 00:05 Prague day-29; bucket
  //     flips, budget resets, Judge approves the fresh OPEN.
  const starts = [
    '2026-04-27T22:25:00.000Z',
    '2026-04-27T22:30:00.000Z',
    '2026-04-27T22:35:00.000Z',
    '2026-04-27T22:40:00.000Z',
    '2026-04-27T22:45:00.000Z',
    '2026-04-27T22:50:00.000Z',
    '2026-04-27T23:40:00.000Z',
    '2026-04-27T23:45:00.000Z',
    '2026-04-28T00:00:00.000Z',
    '2026-04-28T22:00:00.000Z',
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

async function loadReplayFixturePersona(): Promise<PersonaConfig> {
  const persona = await loadPersonaConfig();
  return {
    ...persona,
    judge: {
      ...persona.judge,
      personaRejectionRules: ['confluence_too_weak', 'outside_active_window', 'stop_inside_noise'],
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

  constructor(
    private readonly bars: ReadonlyArray<Bar>,
    private readonly events: ReadonlyArray<CalendarEvent> = [],
  ) {}

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

  async getEvents(args: { fromMs: number; toMs: number }): Promise<readonly CalendarEvent[]> {
    return this.events.filter(
      (event) => event.timestamp >= args.fromMs && event.timestamp < args.toMs,
    );
  }
}
