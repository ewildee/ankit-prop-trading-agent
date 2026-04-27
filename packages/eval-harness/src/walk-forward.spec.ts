import { describe, expect, test } from 'bun:test';
import type { EvalMetrics, FtmoBreach } from './types.ts';
import { buildFolds, runWalkForward, WALK_FORWARD_FOLD_COUNT } from './walk-forward.ts';

describe('walk-forward', () => {
  test('buildFolds always emits exactly 12 folds', () => {
    const folds = buildFolds({
      windowStart: new Date('2025-01-01T00:00:00Z'),
      windowEnd: new Date('2026-08-01T00:00:00Z'),
    });
    expect(folds.length).toBe(WALK_FORWARD_FOLD_COUNT);
    expect(folds[0]?.index).toBe(0);
    expect(folds[11]?.index).toBe(11);
  });

  test('buildFolds throws if window is too short for 12 folds', () => {
    expect(() =>
      buildFolds({
        windowStart: new Date('2025-01-01T00:00:00Z'),
        windowEnd: new Date('2025-09-01T00:00:00Z'),
      }),
    ).toThrow();
  });

  test('runWalkForward applies pass criteria per fold', async () => {
    const baseMetrics: EvalMetrics = {
      sortinoRolling60d: 1.4,
      maxDrawdownPct: 3,
      profitFactor: 1.6,
      tradeCount: 60,
      winRate: 0.55,
      averageRR: 1.5,
    };
    const breach: FtmoBreach = {
      kind: 'daily_loss',
      scope: 'internal',
      accountId: 'a',
      envelopeId: null,
      occurredAt: '2026',
      message: 'sim',
      detail: {},
    };
    const result = await runWalkForward({
      windowStart: new Date('2025-01-01T00:00:00Z'),
      windowEnd: new Date('2026-08-01T00:00:00Z'),
      baseline: { sortinoRolling60d: 1.2, maxDrawdownPct: 5 },
      runFold: async (fold) => {
        if (fold.index === 0) {
          return { metrics: baseMetrics, ftmoBreaches: [breach] };
        }
        if (fold.index === 1) {
          return {
            metrics: { ...baseMetrics, tradeCount: 5 },
            ftmoBreaches: [],
          };
        }
        return { metrics: baseMetrics, ftmoBreaches: [] };
      },
    });
    expect(result.folds.length).toBe(12);
    expect(result.folds[0]?.passed).toBe(false);
    expect(result.folds[0]?.reason).toBe('breaches_present');
    expect(result.folds[1]?.reason).toBe('too_few_trades');
    expect(result.passingFolds).toBe(10);
  });
});
