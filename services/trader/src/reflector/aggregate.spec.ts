import { describe, expect, test } from 'bun:test';
import { RunAggregate } from '@ankit-prop/contracts';
import { aggregateDecisionRecords } from './aggregate.ts';
import { fixtureRun } from './test-fixtures.ts';

describe('aggregateDecisionRecords', () => {
  test('folds DecisionRecord JSONL content into the canonical RunAggregate', () => {
    const { aggregate, realizedPnlPoints } = aggregateDecisionRecords(fixtureRun());

    expect(() => RunAggregate.parse(aggregate)).not.toThrow();
    expect(aggregate.runId).toBe('reflector-spec-run');
    expect(aggregate.decisionCount).toBe(3);
    expect(aggregate.traderActions).toEqual({ HOLD: 1, OPEN: 1, CLOSE: 1, AMEND: 0 });
    expect(aggregate.judgeVerdicts).toEqual({ APPROVE: 2, REJECT: 0 });
    expect(aggregate.gatewayOutcomes).toEqual({
      allow: 2,
      tighten: 0,
      reject: 0,
      not_submitted: 1,
    });
    expect(aggregate.analystFallbackCount).toBe(0);
    expect(aggregate.tradeCount).toBe(2);
    expect(aggregate.breachCount).toBe(0);
    expect(aggregate.realizedPnl).toBe(125);
    expect(realizedPnlPoints).toEqual([{ closedAt: '2026-04-27T14:45:02.000Z', realizedPnl: 125 }]);
  });

  test('counts analyst safe-fallback records in the aggregate', () => {
    const records = fixtureRun();
    const { aggregate } = aggregateDecisionRecords([
      {
        ...records[0]!,
        analystOutput: {
          ...records[0]!.analystOutput,
          thesis:
            'ANALYST_SAFE_FALLBACK: structured generation failed after retry escalation; neutral HOLD emitted.',
          fallbackReason: 'no_object_generated_length',
        },
      },
      ...records.slice(1),
    ]);

    expect(aggregate.analystFallbackCount).toBe(1);
  });
});
