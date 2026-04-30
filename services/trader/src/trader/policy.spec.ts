import { describe, expect, test } from 'bun:test';
import type { AnalystOutput, PersonaConfig } from '@ankit-prop/contracts';
import type { Bar } from '@ankit-prop/market-data';
import { EPSILON, HUNDRED, ZERO } from '../analyst/constants.ts';
import { loadPersonaConfig } from '../persona-config/loader.ts';
import { createVAnkitClassicTrader } from './policy.ts';

const ZERO_CACHE_STATS = {
  inputCachedTokens: ZERO,
  inputFreshTokens: ZERO,
  inputCacheWriteTokens: ZERO,
  outputTokens: ZERO,
  thinkingTokens: ZERO,
} as const;

describe('createVAnkitClassicTrader', () => {
  test('holds when analyst bias is neutral', async () => {
    const persona = await loadPersonaConfig();
    const output = await createVAnkitClassicTrader().decide({
      bar: barFor(persona),
      persona,
      context: contextFor(persona),
      analystOutput: analystFor(persona, { bias: 'neutral' }),
    });

    expect(output.action).toBe('HOLD');
    if (output.action === 'HOLD') expect(output.reason).toBe('neutral_bias');
  });

  test('holds when confidence is below the scoring threshold', async () => {
    const persona = await loadPersonaConfig();
    const output = await createVAnkitClassicTrader().decide({
      bar: barFor(persona),
      persona,
      context: contextFor(persona),
      analystOutput: analystFor(persona, {
        confidence: persona.scoring.threshold / HUNDRED - EPSILON,
      }),
    });

    expect(output.action).toBe('HOLD');
    if (output.action === 'HOLD') expect(output.reason).toBe('confidence_below_threshold');
  });

  test('opens in the analyst direction when no position is open', async () => {
    const persona = await loadPersonaConfig();
    const output = await createVAnkitClassicTrader({
      currentEquity: () => persona.analyst.maxOutputTokens * HUNDRED,
      recentAtrPips: () => persona.filters.minStopAtrMultiple + persona.macro.minConfidence,
    }).decide({
      bar: barFor(persona),
      persona,
      context: contextFor(persona),
      analystOutput: analystFor(persona),
    });

    expect(output.action).toBe('OPEN');
    if (output.action === 'OPEN') {
      expect(output.side).toBe('BUY');
      expect(output.size.pctEquity).toBe(persona.risk.maxPerTradePct);
      expect(output.stopLossPips).toBeGreaterThan(ZERO);
      expect(output.takeProfitPips).toBe(output.stopLossPips * persona.risk.minRR);
      expect(output.expectedRR).toBe(persona.risk.minRR);
    }
  });

  test('closes an opposite open position', async () => {
    const persona = await loadPersonaConfig();
    const output = await createVAnkitClassicTrader({
      openPosition: () => ({ id: 'position-open', side: 'SELL' }),
    }).decide({
      bar: barFor(persona),
      persona,
      context: contextFor(persona),
      analystOutput: analystFor(persona),
    });

    expect(output.action).toBe('CLOSE');
    if (output.action === 'CLOSE') expect(output.positionId).toBe('position-open');
  });

  test('holds when the open position is already aligned', async () => {
    const persona = await loadPersonaConfig();
    const output = await createVAnkitClassicTrader({
      openPosition: () => ({ id: 'position-open', side: 'BUY' }),
    }).decide({
      bar: barFor(persona),
      persona,
      context: contextFor(persona),
      analystOutput: analystFor(persona),
    });

    expect(output.action).toBe('HOLD');
    if (output.action === 'HOLD') expect(output.reason).toBe('existing_position_aligned');
  });

  test('never emits outside the v0 runtime allow-list', async () => {
    const persona = await loadPersonaConfig();
    const output = await createVAnkitClassicTrader().decide({
      bar: barFor(persona),
      persona,
      context: contextFor(persona),
      analystOutput: analystFor(persona, { bias: 'short' }),
    });

    expect(output.action).not.toBe('AMEND');
    if (output.action !== 'AMEND') expect(persona.v0RuntimeActionAllowList).toContain(output.action);
  });
});

function analystFor(persona: PersonaConfig, overrides: Partial<AnalystOutput> = {}): AnalystOutput {
  return {
    thesis: 'XAUUSD has enough confluence for the deterministic trader policy fixture.',
    bias: 'long',
    confidence: persona.scoring.threshold / HUNDRED,
    confluenceScore: persona.judge.threshold,
    keyLevels: [
      { name: 'fixture level', price: barFor(persona).close, timeframe: persona.timeframe },
    ],
    regimeLabel: 'B_trend_retrace',
    regimeNote: 'fixture',
    cacheStats: ZERO_CACHE_STATS,
    ...overrides,
  };
}

function barFor(persona: PersonaConfig): Bar {
  const base = persona.judge.threshold + persona.scoring.threshold;
  const tsStart = Date.now();
  const tsEnd = tsStart + persona.analyst.maxOutputTokens;
  return {
    symbol: persona.instrument,
    timeframe: persona.timeframe,
    tsStart,
    tsEnd,
    open: base,
    high: base + persona.filters.minStopAtrMultiple,
    low: base - persona.filters.minStopAtrMultiple,
    close: base + persona.macro.minConfidence,
    volume: persona.analyst.maxOutputTokens,
  };
}

function contextFor(persona: PersonaConfig) {
  return {
    runId: 'trader-policy-spec',
    paramsHash: persona.personaId,
    decidedAt: new Date().toISOString(),
  };
}
