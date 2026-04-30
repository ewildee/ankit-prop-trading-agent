import {
  composeRailVerdict,
  type DecisionRecord,
  type GatewayDecision,
  RailDecision,
  type TraderCloseOutput,
  type TraderHoldOutput,
  type TraderOpenOutput,
  type TraderOutput,
} from '@ankit-prop/contracts';

export const ZERO_CACHE_STATS = {
  inputCachedTokens: 0,
  inputFreshTokens: 0,
  inputCacheWriteTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
} as const;

export const ONE_MILLION_EACH_CACHE_STATS = {
  inputCachedTokens: 1_000_000,
  inputFreshTokens: 1_000_000,
  inputCacheWriteTokens: 1_000_000,
  outputTokens: 1_000_000,
  thinkingTokens: 1_000_000,
} as const;

export function fixtureDecision(
  overrides: Partial<DecisionRecord> & {
    readonly decisionId: string;
    readonly traderOutput: TraderOutput;
    readonly gatewayDecision: GatewayDecision | null;
  },
): DecisionRecord {
  return {
    decisionId: overrides.decisionId,
    runId: overrides.runId ?? 'reflector-spec-run',
    personaId: overrides.personaId ?? 'v_ankit_classic',
    instrument: overrides.instrument ?? 'XAUUSD',
    timeframe: overrides.timeframe ?? '5m',
    barClosedAt: overrides.barClosedAt ?? '2026-04-27T14:35:00.000Z',
    paramsHash: overrides.paramsHash ?? 'sha256:fixture',
    analystOutput: overrides.analystOutput ?? {
      thesis: 'XAUUSD has a fixture thesis long enough to satisfy the contract boundary.',
      bias: 'neutral',
      confidence: 0.5,
      confluenceScore: 50,
      keyLevels: [{ name: 'fixture', price: 2332.1, timeframe: '5m' }],
      regimeLabel: 'unknown',
      regimeNote: 'fixture',
      cacheStats: ZERO_CACHE_STATS,
    },
    traderOutput: overrides.traderOutput,
    judgeOutput: overrides.judgeOutput ?? null,
    gatewayDecision: overrides.gatewayDecision,
    decidedAt: overrides.decidedAt ?? '2026-04-27T14:35:02.000Z',
  };
}

export function holdOutput(): TraderHoldOutput {
  return {
    action: 'HOLD',
    rationale: 'Fixture hold.',
    reason: 'fixture',
    cacheStats: ZERO_CACHE_STATS,
  };
}

export function openOutput(): TraderOpenOutput {
  return {
    action: 'OPEN',
    idempotencyKey: 'fixture-open',
    side: 'BUY',
    size: { lots: 0.1, pctEquity: 0.25 },
    entry: { type: 'market' },
    stopLossPips: 100,
    takeProfitPips: 200,
    rationale: 'Fixture open.',
    expectedRR: 2,
    cacheStats: ZERO_CACHE_STATS,
  };
}

export function closeOutput(): TraderCloseOutput {
  return {
    action: 'CLOSE',
    idempotencyKey: 'fixture-close',
    positionId: 'fixture-position',
    rationale: 'Fixture close.',
    cacheStats: ZERO_CACHE_STATS,
  };
}

export function approvedJudgeOutput() {
  return {
    verdict: 'APPROVE',
    reason: 'fixture',
    cacheStats: ZERO_CACHE_STATS,
  } as const;
}

export function notSubmittedHoldGateway(traderOutput = holdOutput()): GatewayDecision {
  return {
    status: 'not_submitted',
    reason: 'hold',
    traderOutput,
    railVerdict: null,
  };
}

export function submittedGateway(
  traderOutput: TraderOpenOutput | TraderCloseOutput,
  decidedAt: string,
  detail: Record<string, unknown> = {},
): GatewayDecision {
  return {
    status: 'submitted',
    traderOutput,
    railVerdict: composeRailVerdict(
      [
        RailDecision.parse({
          rail: 'idempotency',
          outcome: 'allow',
          reason: 'fixture allow',
          detail,
          decidedAt,
        }),
      ],
      decidedAt,
    ),
    submittedAt: decidedAt,
  };
}

export function fixtureRun(): DecisionRecord[] {
  const open = openOutput();
  const close = closeOutput();
  return [
    fixtureDecision({
      decisionId: 'decision-hold',
      traderOutput: holdOutput(),
      gatewayDecision: notSubmittedHoldGateway(),
      decidedAt: '2026-04-27T14:35:02.000Z',
    }),
    fixtureDecision({
      decisionId: 'decision-open',
      traderOutput: open,
      judgeOutput: approvedJudgeOutput(),
      gatewayDecision: submittedGateway(open, '2026-04-27T14:40:02.000Z'),
      decidedAt: '2026-04-27T14:40:02.000Z',
    }),
    fixtureDecision({
      decisionId: 'decision-close',
      traderOutput: close,
      judgeOutput: approvedJudgeOutput(),
      gatewayDecision: submittedGateway(close, '2026-04-27T14:45:02.000Z', {
        realizedPnl: 125,
      }),
      decidedAt: '2026-04-27T14:45:02.000Z',
    }),
  ];
}
