import { type DecisionRecord, type RunAggregate, TRADER_ACTIONS } from '@ankit-prop/contracts';
import { summarizeLlmCost } from './cost.ts';
import { computeSortinoRolling60d, type RealizedPnlPoint, type SortinoSummary } from './sortino.ts';

export type ReflectorAggregate = {
  readonly aggregate: RunAggregate;
  readonly sortino: SortinoSummary;
  readonly realizedPnlPoints: ReadonlyArray<RealizedPnlPoint>;
};

const JUDGE_VERDICTS = ['APPROVE', 'REJECT'] as const;
const GATEWAY_OUTCOMES = ['allow', 'tighten', 'reject', 'not_submitted'] as const;

export function aggregateDecisionRecords(
  records: ReadonlyArray<DecisionRecord>,
): ReflectorAggregate {
  if (records.length === 0) {
    throw new Error('cannot aggregate an empty DecisionRecord run');
  }

  const first = records[0];
  const last = records[records.length - 1];
  if (!first || !last) {
    throw new Error('cannot aggregate an empty DecisionRecord run');
  }
  const traderActions = Object.fromEntries(TRADER_ACTIONS.map((action) => [action, 0])) as Record<
    (typeof TRADER_ACTIONS)[number],
    number
  >;
  const judgeVerdicts = Object.fromEntries(JUDGE_VERDICTS.map((verdict) => [verdict, 0])) as Record<
    (typeof JUDGE_VERDICTS)[number],
    number
  >;
  const gatewayOutcomes = Object.fromEntries(
    GATEWAY_OUTCOMES.map((outcome) => [outcome, 0]),
  ) as Record<(typeof GATEWAY_OUTCOMES)[number], number>;
  const realizedPnlPoints: RealizedPnlPoint[] = [];
  let analystFallbackCount = 0;
  let breachCount = 0;
  let tradeCount = 0;

  for (const record of records) {
    if (record.analystOutput.fallbackReason) analystFallbackCount += 1;
    traderActions[record.traderOutput.action] += 1;
    if (record.judgeOutput) judgeVerdicts[record.judgeOutput.verdict] += 1;

    const gatewayDecision = record.gatewayDecision;
    if (!gatewayDecision || gatewayDecision.status === 'not_submitted') {
      gatewayOutcomes.not_submitted += 1;
      continue;
    }

    if (gatewayDecision.status === 'rejected_by_rails') {
      gatewayOutcomes.reject += 1;
      breachCount += 1;
      continue;
    }

    gatewayOutcomes[gatewayDecision.railVerdict.outcome] += 1;
    tradeCount += 1;
    if (gatewayDecision.railVerdict.outcome === 'reject') breachCount += 1;
    const realizedPnl = extractRealizedPnl(record);
    if (realizedPnl !== null) {
      realizedPnlPoints.push({ closedAt: record.decidedAt, realizedPnl });
    }
  }

  const sortino = computeSortinoRolling60d(realizedPnlPoints, { asOf: last.decidedAt });
  const aggregate = {
    runId: first.runId,
    personaId: first.personaId,
    instrument: first.instrument,
    startedAt: first.decidedAt,
    endedAt: last.decidedAt,
    decisionCount: records.length,
    sortinoRolling60d: sortino.sortinoRolling60d,
    llmCostUsd: summarizeLlmCost(records),
    breachCount,
    tradeCount,
    analystFallbackCount,
    realizedPnl: realizedPnlPoints.reduce((sum, point) => sum + point.realizedPnl, 0),
    traderActions,
    judgeVerdicts,
    gatewayOutcomes,
  };

  return { aggregate, sortino, realizedPnlPoints };
}

function extractRealizedPnl(record: DecisionRecord): number | null {
  if (record.traderOutput.action !== 'CLOSE') return null;
  const decisions =
    record.gatewayDecision?.status === 'submitted'
      ? record.gatewayDecision.railVerdict.decisions
      : [];
  for (const decision of decisions) {
    const realizedPnl = decision.detail.realizedPnl ?? decision.detail.realizedPnlUsd;
    if (typeof realizedPnl === 'number' && Number.isFinite(realizedPnl)) return realizedPnl;
  }
  return null;
}
