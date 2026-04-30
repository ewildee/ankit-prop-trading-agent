import { describe, expect, test } from 'bun:test';
import { composeRailVerdict } from './hard-rails.ts';
import {
  AnalystOutput,
  DecisionRecord,
  GatewayDecision,
  JudgeInput,
  JudgeOutput,
  PersonaConfig,
  TRADER_ACTIONS,
  TraderOutput,
  V0_TRADER_RUNTIME_ACTIONS,
} from './personas.ts';

const cacheStats = {
  inputCachedTokens: 100,
  inputFreshTokens: 50,
  inputCacheWriteTokens: 0,
  outputTokens: 40,
  thinkingTokens: 10,
} as const;

const analystOutput = {
  thesis:
    'XAUUSD remains bid above the pre-session midpoint, but the setup still needs a confirmed 5-minute close.',
  bias: 'long',
  confidence: 0.72,
  keyLevels: [{ name: 'pre-session high', price: 2352.4, timeframe: '5m' }],
  regimeLabel: 'B_trend_retrace',
  regimeNote: 'Trend retrace is active.',
  reasoningSummary: 'Higher timeframes agree with the 5-minute pullback.',
  supportingEvidence: '1h MA20 support held; MACD histogram positive.',
  freshnessLag: 250,
  cacheStats,
} as const;

const holdOutput = {
  action: 'HOLD',
  rationale: 'Waiting for a confirmed 5-minute close beyond resistance.',
  reason: 'no confirmed entry',
  cacheStats,
} as const;

const openOutput = {
  action: 'OPEN',
  side: 'BUY',
  size: { lots: 0.1, pctEquity: 0.4 },
  entry: { type: 'market' },
  stopLoss: 2346.5,
  takeProfit: 2361,
  rationale: 'Trend retrace has enough confluence to open with defined risk.',
  expectedRR: 1.8,
  cacheStats,
} as const;

const judgeOutput = {
  verdict: 'APPROVE',
  reason: 'Risk and confluence checks pass.',
  cacheStats,
} as const;

const calendarItem = {
  title: 'US CPI',
  impact: 'high',
  instrument: 'USD + XAUUSD',
  restriction: true,
  eventType: 'normal',
  date: '2026-04-30T14:30:00+02:00',
  forecast: null,
  previous: null,
  actual: null,
  youtubeLink: null,
  articleLink: null,
} as const;

const railRejectedVerdict = composeRailVerdict(
  [
    {
      rail: 'spread_guard',
      outcome: 'reject',
      reason: 'spread blew out',
      detail: {},
      decidedAt: '2026-04-30T14:35:01.500Z',
    },
  ],
  '2026-04-30T14:35:01.500Z',
);

const railAllowedVerdict = composeRailVerdict(
  [
    {
      rail: 'spread_guard',
      outcome: 'allow',
      reason: 'spread within threshold',
      detail: {},
      decidedAt: '2026-04-30T14:35:01.500Z',
    },
  ],
  '2026-04-30T14:35:01.500Z',
);

describe('persona pipeline contracts', () => {
  test('AnalystOutput accepts the blueprint-backed v_ankit_classic shape', () => {
    const parsed = AnalystOutput.parse(analystOutput);

    expect(parsed.bias).toBe('long');
    expect(parsed.regimeLabel).toBe('B_trend_retrace');
  });

  test('AnalystOutput stays strict at the contract boundary', () => {
    expect(() =>
      AnalystOutput.parse({
        ...analystOutput,
        extra: true,
      }),
    ).toThrow();
  });

  test('TraderOutput is canonical HOLD | OPEN | CLOSE | AMEND and excludes TRAIL', () => {
    expect(TRADER_ACTIONS).toEqual(['HOLD', 'OPEN', 'CLOSE', 'AMEND']);
    expect(V0_TRADER_RUNTIME_ACTIONS).toEqual(['HOLD', 'OPEN', 'CLOSE']);
    expect(TraderOutput.parse(holdOutput).action).toBe('HOLD');
    expect(TraderOutput.parse(openOutput).action).toBe('OPEN');
    expect(
      TraderOutput.parse({
        action: 'AMEND',
        positionId: 'pos-1',
        amend: { amendType: 'sl', newValue: 2349 },
        rationale: 'Tighten stop after price moves in favour.',
        cacheStats,
      }).action,
    ).toBe('AMEND');
    expect(() =>
      TraderOutput.parse({
        action: 'TRAIL',
        rationale: 'Legacy action should not be accepted.',
        cacheStats,
      }),
    ).toThrow();
  });

  test('JudgeInput and JudgeOutput allow normal no-trade without modelling it as a rejection', () => {
    const judgeInput = JudgeInput.parse({
      traderOutput: holdOutput,
      analystOutput,
      riskBudgetRemaining: { dailyPct: 3.5, overallPct: 8 },
      openExposure: { totalPct: 0, sameDirectionPct: 0 },
      recentDecisions: [],
      calendarLookahead: [calendarItem],
      spreadStats: { current: 15, typical: 12 },
      strategyParams: { risk: { minRR: 1.5, maxPerTradePct: 0.5 } },
    });
    const parsedJudgeOutput = JudgeOutput.parse({
      verdict: 'APPROVE',
      reason: 'Hold is a valid terminal no-op before the gateway.',
      cacheStats,
    });

    expect(judgeInput.traderOutput.action).toBe('HOLD');
    expect(parsedJudgeOutput.verdict).toBe('APPROVE');
  });

  test('GatewayDecision keeps HOLD out of gateway rail submission telemetry', () => {
    const parsed = GatewayDecision.parse({
      status: 'not_submitted',
      reason: 'hold',
      traderOutput: holdOutput,
      railVerdict: null,
    });

    expect(parsed.status).toBe('not_submitted');
  });

  test('GatewayDecision rejects submitted telemetry with a rail reject verdict', () => {
    const parsed = GatewayDecision.safeParse({
      status: 'submitted',
      traderOutput: openOutput,
      railVerdict: railRejectedVerdict,
      submittedAt: '2026-04-30T14:35:02.000Z',
    });

    expect(parsed.success).toBe(false);
  });

  test('GatewayDecision accepts explicit rail-reject telemetry before broker submission', () => {
    const parsed = GatewayDecision.safeParse({
      status: 'rejected_by_rails',
      traderOutput: openOutput,
      railVerdict: railRejectedVerdict,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe('rejected_by_rails');
      expect(parsed.data.railVerdict?.outcome).toBe('reject');
    }
  });

  test('GatewayDecision accepts submitted telemetry with an allow verdict', () => {
    const parsed = GatewayDecision.parse({
      status: 'submitted',
      traderOutput: openOutput,
      railVerdict: railAllowedVerdict,
      submittedAt: '2026-04-30T14:35:02.000Z',
    });

    expect(parsed.status).toBe('submitted');
    expect(parsed.railVerdict?.outcome).toBe('allow');
  });

  test('DecisionRecord composes analyst, trader, judge, and gateway artifacts', () => {
    const record = DecisionRecord.parse({
      decisionId: 'decision-1',
      runId: 'run-1',
      personaId: 'v_ankit_classic',
      instrument: 'XAUUSD',
      timeframe: '5m',
      barClosedAt: '2026-04-30T14:35:00.000Z',
      paramsHash: 'sha256:params',
      analystOutput,
      traderOutput: openOutput,
      judgeOutput,
      gatewayDecision: null,
      decidedAt: '2026-04-30T14:35:02.000Z',
    });

    expect(record.personaId).toBe('v_ankit_classic');
    expect(record.traderOutput.action).toBe('OPEN');
  });
});

describe('PersonaConfig', () => {
  test('accepts the default v_ankit_classic params skeleton', () => {
    const parsed = PersonaConfig.parse({
      schemaVersion: 1,
      personaId: 'v_ankit_classic',
      instrument: 'XAUUSD',
      timeframe: '5m',
      decisionCadence: '5m',
      actionCadence: 'bar_close',
      v0RuntimeActionAllowList: ['HOLD', 'OPEN', 'CLOSE'],
      windowPrague: {
        macroSynthesis: '08:00',
        preSessionStart: '13:00',
        preSessionEnd: '14:30',
        activeStart: '14:00',
        activeEnd: '21:30',
      },
      families: {
        sessionBreakout: {
          enabled: true,
          start: '14:25',
          end: '15:30',
          targetMinR: 1.5,
          stopAtPreSessionMidpoint: true,
        },
        multiTimeframeConfluence: { enabled: true, start: '15:30', end: '21:30' },
        macroFilter: { enabled: true },
      },
      macro: { minConfidence: 0.6, cooldownHoursAfterFlip: 4 },
      risk: { maxPerTradePct: 0.5, minRR: 1.5 },
      filters: { maxSpreadMultiplier: 1.5, minStopAtrMultiple: 1 },
      judge: {
        threshold: 70,
        personaRejectionRules: [
          'macro_bias_violation',
          'confluence_too_weak',
          'anticipation_breakout',
          'stop_inside_noise',
          'pattern_regime_mismatch',
          'outside_active_window',
        ],
      },
      indicators: {
        timeframes: ['1d', '4h', '1h', '5m'],
        enabled: [
          { name: 'ma', params: { periods: [20, 50] } },
          { name: 'macd', params: { fast: 12, slow: 26, signal: 9 } },
          { name: 'rsi', params: { period: 14 } },
          { name: 'stochastic', params: { k_period: 14, d_period: 3 } },
          { name: 'atr', params: { period: 14 } },
        ],
      },
      scoring: {
        scheme: 'v1_continuous_confluence',
        threshold: 50,
        weights: { timeframeAgreement: 0.7, indicatorAlignment: 0.3 },
        timeframeWeights: { '1d': 4, '4h': 3, '1h': 2, '5m': 1 },
      },
      trail: { enabled: false, activateAtR: 1, distanceDollars: 3 },
      escalation: {
        nearBarCloseSeconds: 30,
        disagreementLookback: 3,
        dailyRiskBudgetConsumedPct: 50,
      },
    });

    expect(parsed.scoring.threshold).toBe(50);
    expect(parsed.v0RuntimeActionAllowList).not.toContain('AMEND');
  });
});
