import type { EvalMetrics, EvalResult, FoldResult } from './types.ts';

export type PromotionGateInput = {
  candidate: EvalResult;
  baseline: {
    sortinoRolling60d: number;
    maxDrawdownPct: number;
  };
  minTrades?: number;
  minSortinoLiftPct?: number;
  minPassingFolds?: number;
};

export type PromotionDecision = {
  promote: boolean;
  reasons: string[];
  failed: PromotionFailure[];
};

export type PromotionFailure =
  | 'breaches_present'
  | 'sortino_below_baseline_lift'
  | 'too_few_trades'
  | 'drawdown_above_baseline'
  | 'too_few_passing_folds';

export function evaluatePromotionGate(input: PromotionGateInput): PromotionDecision {
  const minTrades = input.minTrades ?? 40;
  const liftPct = input.minSortinoLiftPct ?? 5;
  const minPassingFolds = input.minPassingFolds ?? 8;
  const reasons: string[] = [];
  const failed: PromotionFailure[] = [];

  if (input.candidate.ftmoBreaches.length > 0) {
    failed.push('breaches_present');
    reasons.push(`breaches_present: ${input.candidate.ftmoBreaches.length} FTMO breach(es)`);
  }

  const targetSortino = input.baseline.sortinoRolling60d * (1 + liftPct / 100);
  if (input.candidate.metrics.sortinoRolling60d < targetSortino) {
    failed.push('sortino_below_baseline_lift');
    reasons.push(
      `sortino_below_baseline_lift: ${input.candidate.metrics.sortinoRolling60d.toFixed(
        4,
      )} < target ${targetSortino.toFixed(4)} (baseline ${input.baseline.sortinoRolling60d.toFixed(
        4,
      )} × 1.${liftPct.toString().padStart(2, '0')})`,
    );
  }

  if (input.candidate.metrics.tradeCount < minTrades) {
    failed.push('too_few_trades');
    reasons.push(`too_few_trades: ${input.candidate.metrics.tradeCount} < ${minTrades}`);
  }

  if (input.candidate.metrics.maxDrawdownPct > input.baseline.maxDrawdownPct) {
    failed.push('drawdown_above_baseline');
    reasons.push(
      `drawdown_above_baseline: ${input.candidate.metrics.maxDrawdownPct.toFixed(
        2,
      )}% > baseline ${input.baseline.maxDrawdownPct.toFixed(2)}%`,
    );
  }

  const wf = input.candidate.walkForward;
  if (!wf) {
    failed.push('too_few_passing_folds');
    reasons.push('too_few_passing_folds: walk-forward missing');
  } else if (wf.passingFolds < minPassingFolds) {
    failed.push('too_few_passing_folds');
    reasons.push(`too_few_passing_folds: ${wf.passingFolds} < ${minPassingFolds}`);
  }

  return {
    promote: failed.length === 0,
    reasons,
    failed,
  };
}

export function isFoldPassing(
  fold: FoldResult,
  baseline: { sortinoRolling60d: number; maxDrawdownPct: number },
  minTrades = 40,
  liftPct = 5,
): { passed: boolean; reason: string | null } {
  if (fold.ftmoBreaches.length > 0) {
    return { passed: false, reason: 'breaches_present' };
  }
  const target = baseline.sortinoRolling60d * (1 + liftPct / 100);
  if (fold.metrics.sortinoRolling60d < target) {
    return { passed: false, reason: 'sortino_below_baseline_lift' };
  }
  if (fold.metrics.tradeCount < minTrades) {
    return { passed: false, reason: 'too_few_trades' };
  }
  if (fold.metrics.maxDrawdownPct > baseline.maxDrawdownPct) {
    return { passed: false, reason: 'drawdown_above_baseline' };
  }
  return { passed: true, reason: null };
}

export function summarizeFoldMetrics(folds: ReadonlyArray<FoldResult>): EvalMetrics {
  if (folds.length === 0) {
    return {
      sortinoRolling60d: 0,
      maxDrawdownPct: 0,
      profitFactor: 0,
      tradeCount: 0,
      winRate: 0,
      averageRR: 0,
    };
  }
  const acc = {
    sortinoRolling60d: 0,
    maxDrawdownPct: 0,
    profitFactor: 0,
    tradeCount: 0,
    winRate: 0,
    averageRR: 0,
  };
  for (const f of folds) {
    acc.sortinoRolling60d += f.metrics.sortinoRolling60d;
    acc.maxDrawdownPct = Math.max(acc.maxDrawdownPct, f.metrics.maxDrawdownPct);
    acc.profitFactor += f.metrics.profitFactor;
    acc.tradeCount += f.metrics.tradeCount;
    acc.winRate += f.metrics.winRate;
    acc.averageRR += f.metrics.averageRR;
  }
  const n = folds.length;
  return {
    sortinoRolling60d: acc.sortinoRolling60d / n,
    maxDrawdownPct: acc.maxDrawdownPct,
    profitFactor: acc.profitFactor / n,
    tradeCount: acc.tradeCount,
    winRate: acc.winRate / n,
    averageRR: acc.averageRR / n,
  };
}
