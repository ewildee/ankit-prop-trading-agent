import { describe, expect, test } from 'bun:test';
import type {
  AnalystOutput,
  CalendarItem,
  JudgeInput,
  PersonaConfig,
  TraderOpenOutput,
} from '@ankit-prop/contracts';
import type { Bar } from '@ankit-prop/market-data';
import { EPSILON, HUNDRED, ZERO } from '../analyst/constants.ts';
import { loadPersonaConfig } from '../persona-config/loader.ts';
import { createVAnkitClassicJudge } from './policy.ts';

const ZERO_CACHE_STATS = {
  inputCachedTokens: ZERO,
  inputFreshTokens: ZERO,
  inputCacheWriteTokens: ZERO,
  outputTokens: ZERO,
  thinkingTokens: ZERO,
} as const;

describe('createVAnkitClassicJudge', () => {
  test('rejects trader HOLD as weak confluence telemetry', async () => {
    const persona = await loadJudgeFixturePersona();
    const output = await createVAnkitClassicJudge().evaluate(
      stageInput(persona, {
        ...judgeInput(persona),
        traderOutput: {
          action: 'HOLD',
          rationale: 'hold fixture',
          reason: 'fixture',
          cacheStats: ZERO_CACHE_STATS,
        },
      }),
    );

    expect(output.verdict).toBe('REJECT');
    expect(output.reason).toBe('trader_hold');
    expect(output.rejectedRules).toContain('confluence_too_weak');
  });

  test('approves CLOSE as risk reducing', async () => {
    const persona = await loadJudgeFixturePersona();
    const output = await createVAnkitClassicJudge().evaluate(
      stageInput(persona, {
        ...judgeInput(persona),
        traderOutput: {
          action: 'CLOSE',
          idempotencyKey: 'close-fixture',
          positionId: 'position-fixture',
          rationale: 'close fixture',
          cacheStats: ZERO_CACHE_STATS,
        },
      }),
    );

    expect(output.verdict).toBe('APPROVE');
    expect(output.reason).toBe('close_risk_reducing');
  });

  test('approves OPEN when every v0 gate passes', async () => {
    const persona = await loadJudgeFixturePersona();
    const output = await createVAnkitClassicJudge().evaluate(
      stageInput(persona, judgeInput(persona)),
    );

    expect(output.verdict).toBe('APPROVE');
  });

  test('rejects weak confluence', async () => {
    const persona = await loadJudgeFixturePersona();
    const input = judgeInput(persona, {
      analystOutput: analystFor(persona, {
        confluenceScore: persona.judge.threshold - persona.macro.minConfidence,
      }),
    });
    const output = await createVAnkitClassicJudge().evaluate(stageInput(persona, input));

    expect(output.verdict).toBe('REJECT');
    expect(output.rejectedRules).toContain('confluence_too_weak');
  });

  test('rejects reward-to-risk below floor', async () => {
    const persona = await loadJudgeFixturePersona();
    const input = judgeInput(persona, {
      traderOutput: openOutput(persona, {
        expectedRR: persona.risk.minRR - EPSILON,
      }),
    });
    const output = await createVAnkitClassicJudge().evaluate(stageInput(persona, input));

    expect(output.verdict).toBe('REJECT');
    expect(output.rejectedRules).toContain('rr_below_floor');
  });

  test('rejects size above the persona cap', async () => {
    const persona = await loadJudgeFixturePersona();
    const input = judgeInput(persona, {
      traderOutput: openOutput(persona, {
        size: {
          lots: persona.risk.maxPerTradePct,
          pctEquity: persona.risk.maxPerTradePct + EPSILON,
        },
      }),
    });
    const output = await createVAnkitClassicJudge().evaluate(stageInput(persona, input));

    expect(output.verdict).toBe('REJECT');
    expect(output.rejectedRules).toContain('size_above_soft_rail');
  });

  test('rejects insufficient remaining daily budget', async () => {
    const persona = await loadJudgeFixturePersona();
    const input = judgeInput(persona, {
      riskBudgetRemaining: {
        dailyPct: persona.risk.maxPerTradePct - EPSILON,
        overallPct: persona.risk.maxPerTradePct,
      },
    });
    const output = await createVAnkitClassicJudge().evaluate(stageInput(persona, input));

    expect(output.verdict).toBe('REJECT');
    expect(output.rejectedRules).toContain('daily_budget_insufficient');
  });

  test('rejects existing open exposure overlap', async () => {
    const persona = await loadJudgeFixturePersona();
    const input = judgeInput(persona, {
      openExposure: {
        totalPct: persona.risk.maxPerTradePct,
        sameDirectionPct: persona.risk.maxPerTradePct,
      },
    });
    const output = await createVAnkitClassicJudge().evaluate(stageInput(persona, input));

    expect(output.verdict).toBe('REJECT');
    expect(output.rejectedRules).toContain('open_exposure_at_cap');
  });

  test('rejects spread above the persona multiplier', async () => {
    const persona = await loadJudgeFixturePersona();
    const input = judgeInput(persona, {
      spreadStats: {
        current: persona.filters.maxSpreadMultiplier + EPSILON,
        typical: ZERO + persona.filters.maxSpreadMultiplier / persona.filters.maxSpreadMultiplier,
      },
    });
    const output = await createVAnkitClassicJudge().evaluate(stageInput(persona, input));

    expect(output.verdict).toBe('REJECT');
    expect(output.rejectedRules).toContain('spread_above_threshold');
  });

  test('rejects restricted calendar proximity', async () => {
    const persona = await loadJudgeFixturePersona();
    const input = judgeInput(persona, {
      calendarLookahead: [calendarItem(persona)],
    });
    const output = await createVAnkitClassicJudge().evaluate(stageInput(persona, input));

    expect(output.verdict).toBe('REJECT');
    expect(output.rejectedRules).toContain('calendar_event_proximity');
  });

  test('rejects OPEN outside the active window when the persona declares the rule', async () => {
    const persona = personaWithPersonaRules(await loadPersonaConfig(), ['outside_active_window']);
    const input = judgeInput(persona, {
      analystOutput: analystFor(persona, { regimeLabel: 'outside_active_window' }),
    });
    const output = await createVAnkitClassicJudge().evaluate(stageInput(persona, input));

    expect(output.verdict).toBe('REJECT');
    expect(output.rejectedRules).toContain('outside_active_window');
  });

  test('rejects OPEN with stop inside the ATR noise floor', async () => {
    const persona = personaWithPersonaRules(await loadPersonaConfig(), ['stop_inside_noise']);
    const input = judgeInput(persona, {
      atrPips: 50,
      traderOutput: openOutput(persona, {
        stopLossPips: 0.000001,
      }),
    });
    const output = await createVAnkitClassicJudge().evaluate(stageInput(persona, input));

    expect(output.verdict).toBe('REJECT');
    expect(output.rejectedRules).toContain('stop_inside_noise');
  });

  test('fails closed when the persona declares a v0 rule that is not implemented', async () => {
    const persona = personaWithPersonaRules(await loadPersonaConfig(), ['macro_bias_violation']);
    const output = await createVAnkitClassicJudge().evaluate(
      stageInput(persona, judgeInput(persona)),
    );

    expect(output.verdict).toBe('REJECT');
    expect(output.reason).toBe('persona_rule_not_implemented');
    expect(output.rejectedRules).toEqual(['macro_bias_violation']);
  });
});

function judgeInput(persona: PersonaConfig, overrides: Partial<JudgeInput> = {}): JudgeInput {
  return {
    traderOutput: openOutput(persona),
    analystOutput: analystFor(persona),
    atrPips: persona.filters.minStopAtrMultiple,
    riskBudgetRemaining: {
      dailyPct: persona.risk.maxPerTradePct,
      overallPct: persona.risk.maxPerTradePct,
    },
    openExposure: {
      totalPct: ZERO,
      sameDirectionPct: ZERO,
    },
    recentDecisions: [],
    calendarLookahead: [],
    spreadStats: {
      current: persona.filters.maxSpreadMultiplier,
      typical: persona.filters.maxSpreadMultiplier,
    },
    strategyParams: persona as unknown as Record<string, unknown>,
    ...overrides,
  };
}

async function loadJudgeFixturePersona(): Promise<PersonaConfig> {
  return personaWithPersonaRules(await loadPersonaConfig(), [
    'confluence_too_weak',
    'outside_active_window',
    'stop_inside_noise',
  ]);
}

function personaWithPersonaRules(
  persona: PersonaConfig,
  personaRejectionRules: PersonaConfig['judge']['personaRejectionRules'],
): PersonaConfig {
  return {
    ...persona,
    judge: {
      ...persona.judge,
      personaRejectionRules,
    },
  };
}

function openOutput(
  persona: PersonaConfig,
  overrides: Partial<TraderOpenOutput> = {},
): TraderOpenOutput {
  return {
    action: 'OPEN',
    idempotencyKey: 'open-fixture',
    side: 'BUY',
    size: {
      lots: persona.risk.maxPerTradePct,
      pctEquity: persona.risk.maxPerTradePct,
    },
    entry: { type: 'market' },
    stopLossPips: persona.filters.minStopAtrMultiple,
    takeProfitPips: persona.filters.minStopAtrMultiple * persona.risk.minRR,
    rationale: 'open fixture',
    expectedRR: persona.risk.minRR,
    cacheStats: ZERO_CACHE_STATS,
    ...overrides,
  };
}

function analystFor(persona: PersonaConfig, overrides: Partial<AnalystOutput> = {}): AnalystOutput {
  return {
    thesis: 'XAUUSD has enough confluence for the deterministic judge policy fixture.',
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

function stageInput(persona: PersonaConfig, input: JudgeInput) {
  return {
    judgeInput: input,
    bar: barFor(persona),
    persona,
    context: {
      runId: 'judge-policy-spec',
      paramsHash: persona.personaId,
      decidedAt: new Date().toISOString(),
    },
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

function calendarItem(persona: PersonaConfig): CalendarItem {
  return {
    title: 'restricted fixture',
    impact: 'high',
    instrument: persona.instrument,
    restriction: true,
    eventType: 'macro',
    date: new Date().toISOString(),
    forecast: null,
    previous: null,
    actual: null,
    youtubeLink: null,
    articleLink: null,
  };
}
