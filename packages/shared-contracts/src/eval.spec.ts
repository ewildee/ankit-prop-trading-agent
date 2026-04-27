import { describe, expect, test } from 'bun:test';
import {
  type CostBreakdown,
  type EvalMetrics,
  EvalResult,
  type FoldResult,
  FTMO_BREACH_KINDS,
  FtmoBreach,
  StageName,
  WalkForwardFold,
  WalkForwardSummary,
} from './eval.ts';

const sampleMetrics: EvalMetrics = {
  sortinoRolling60d: 1.42,
  maxDrawdownPct: 3.2,
  profitFactor: 1.8,
  tradeCount: 42,
  winRate: 0.58,
  averageRR: 1.6,
};

const sampleStageCosts: CostBreakdown = {
  perStage: {
    analyst: { input: 1.2, output: 0.4, cached: 0.1 },
    trader: { input: 1.0, output: 0.3, cached: 0.05 },
    judge: { input: 0.8, output: 0.2, cached: 0.0 },
    reflector: { input: 0.5, output: 0.1, cached: 0.0 },
  },
  totalUsd: 4.65,
};

describe('eval contracts', () => {
  test('FtmoBreach schema accepts every breach kind', () => {
    for (const kind of FTMO_BREACH_KINDS) {
      const breach: FtmoBreach = {
        kind,
        scope: 'internal',
        accountId: 'ftmo-trial-1',
        envelopeId: null,
        occurredAt: '2026-04-27T12:00:00Z',
        message: `synthetic ${kind}`,
        detail: {},
      };
      expect(() => FtmoBreach.parse(breach)).not.toThrow();
    }
  });

  test('StageName is the closed pipeline enum', () => {
    expect(StageName.options).toEqual(['analyst', 'trader', 'judge', 'reflector']);
  });

  test('EvalResult round-trips with no walkForward', () => {
    const r: EvalResult = {
      metrics: sampleMetrics,
      ftmoBreaches: [],
      costBreakdown: sampleStageCosts,
      diagnostics: { trades: 42 },
    };
    const parsed = EvalResult.parse(r);
    expect(parsed.walkForward).toBeUndefined();
    expect(parsed.costBreakdown.totalUsd).toBe(4.65);
  });

  test('EvalResult.walkForward.folds must have exactly 12 entries', () => {
    const fold: FoldResult = {
      fold: {
        index: 0,
        trainStart: '2025-01-01',
        trainEnd: '2025-07-01',
        scoreStart: '2025-07-01',
        scoreEnd: '2025-08-01',
      },
      metrics: sampleMetrics,
      ftmoBreaches: [],
      passed: true,
      reason: null,
    };
    const elevenFolds: WalkForwardSummary = {
      folds: Array.from({ length: 11 }, (_, i) => ({
        ...fold,
        fold: { ...fold.fold, index: i },
      })),
      passingFolds: 11,
    } as unknown as WalkForwardSummary;
    expect(() => WalkForwardSummary.parse(elevenFolds)).toThrow();

    const twelveFolds: WalkForwardSummary = {
      folds: Array.from({ length: 12 }, (_, i) => ({
        ...fold,
        fold: { ...fold.fold, index: i },
      })),
      passingFolds: 12,
    };
    expect(() => WalkForwardSummary.parse(twelveFolds)).not.toThrow();
  });

  test('WalkForwardFold rejects negative index', () => {
    const bad: WalkForwardFold = {
      index: -1,
      trainStart: '2025-01-01',
      trainEnd: '2025-07-01',
      scoreStart: '2025-07-01',
      scoreEnd: '2025-08-01',
    };
    expect(() => WalkForwardFold.parse(bad)).toThrow();
  });
});
