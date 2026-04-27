import { describe, expect, test } from 'bun:test';
import { emptyCostBreakdown } from './cost.ts';
import { evaluatePromotionGate, isFoldPassing, summarizeFoldMetrics } from './promotion-gate.ts';
import type { EvalResult, FoldResult, FtmoBreach } from './types.ts';

const baselineMetrics = { sortinoRolling60d: 1.2, maxDrawdownPct: 5 };

const goodCandidate: EvalResult = {
  metrics: {
    sortinoRolling60d: 1.4,
    maxDrawdownPct: 4,
    profitFactor: 1.6,
    tradeCount: 60,
    winRate: 0.55,
    averageRR: 1.5,
  },
  ftmoBreaches: [],
  costBreakdown: emptyCostBreakdown(),
  diagnostics: {},
  walkForward: {
    folds: Array.from({ length: 12 }, (_, i) => ({
      fold: {
        index: i,
        trainStart: '2025-01-01',
        trainEnd: '2025-07-01',
        scoreStart: '2025-07-01',
        scoreEnd: '2025-08-01',
      },
      metrics: {
        sortinoRolling60d: 1.4,
        maxDrawdownPct: 4,
        profitFactor: 1.6,
        tradeCount: 60,
        winRate: 0.55,
        averageRR: 1.5,
      },
      ftmoBreaches: [],
      passed: true,
      reason: null,
    })),
    passingFolds: 9,
  },
};

describe('promotion-gate', () => {
  test('passes a clean candidate with ≥ 8 folds', () => {
    const decision = evaluatePromotionGate({
      candidate: goodCandidate,
      baseline: baselineMetrics,
    });
    expect(decision.promote).toBe(true);
    expect(decision.failed).toEqual([]);
  });

  test('any FTMO breach blocks promotion', () => {
    const breach: FtmoBreach = {
      kind: 'daily_loss',
      scope: 'internal',
      accountId: 'ftmo-trial-1',
      envelopeId: null,
      occurredAt: '2026-04-27T12:00:00Z',
      message: 'sim',
      detail: {},
    };
    const decision = evaluatePromotionGate({
      candidate: { ...goodCandidate, ftmoBreaches: [breach] },
      baseline: baselineMetrics,
    });
    expect(decision.promote).toBe(false);
    expect(decision.failed).toContain('breaches_present');
  });

  test('Sortino lift below 5% blocks promotion', () => {
    const decision = evaluatePromotionGate({
      candidate: {
        ...goodCandidate,
        metrics: { ...goodCandidate.metrics, sortinoRolling60d: 1.21 },
      },
      baseline: baselineMetrics,
    });
    expect(decision.promote).toBe(false);
    expect(decision.failed).toContain('sortino_below_baseline_lift');
  });

  test('drawdown above baseline blocks promotion', () => {
    const decision = evaluatePromotionGate({
      candidate: {
        ...goodCandidate,
        metrics: { ...goodCandidate.metrics, maxDrawdownPct: 6 },
      },
      baseline: baselineMetrics,
    });
    expect(decision.failed).toContain('drawdown_above_baseline');
  });

  test('< 40 trades blocks promotion', () => {
    const decision = evaluatePromotionGate({
      candidate: {
        ...goodCandidate,
        metrics: { ...goodCandidate.metrics, tradeCount: 30 },
      },
      baseline: baselineMetrics,
    });
    expect(decision.failed).toContain('too_few_trades');
  });

  test('< 8 passing folds blocks promotion', () => {
    const wf = goodCandidate.walkForward;
    if (!wf) throw new Error('test setup error');
    const decision = evaluatePromotionGate({
      candidate: {
        ...goodCandidate,
        walkForward: { folds: wf.folds, passingFolds: 7 },
      },
      baseline: baselineMetrics,
    });
    expect(decision.failed).toContain('too_few_passing_folds');
  });

  test('isFoldPassing flags breaches', () => {
    const wf = goodCandidate.walkForward;
    if (!wf) throw new Error('test setup error');
    const fold = wf.folds[0];
    if (!fold) throw new Error('test setup error');
    const typedFold: FoldResult = fold;
    expect(isFoldPassing(typedFold, baselineMetrics).passed).toBe(true);
    expect(
      isFoldPassing(
        {
          ...typedFold,
          ftmoBreaches: [
            {
              kind: 'daily_loss',
              scope: 'internal',
              accountId: 'a',
              envelopeId: null,
              occurredAt: '2026',
              message: '',
              detail: {},
            },
          ],
        },
        baselineMetrics,
      ).passed,
    ).toBe(false);
  });

  test('summarizeFoldMetrics aggregates fold metrics', () => {
    const wf = goodCandidate.walkForward;
    if (!wf) throw new Error('test setup error');
    const folds = wf.folds;
    const summary = summarizeFoldMetrics(folds);
    expect(summary.tradeCount).toBe(720);
    expect(summary.maxDrawdownPct).toBe(4);
    expect(summary.sortinoRolling60d).toBeCloseTo(1.4, 5);
  });
});
