import { isFoldPassing } from './promotion-gate.ts';
import type { EvalMetrics, FoldResult, FtmoBreach, WalkForwardFold } from './types.ts';

export const WALK_FORWARD_FOLD_COUNT = 12;

export type WalkForwardCfg = {
  windowStart: Date;
  windowEnd: Date;
  trainMonths?: number;
  scoreMonths?: number;
  stepMonths?: number;
};

export function buildFolds(cfg: WalkForwardCfg): WalkForwardFold[] {
  const trainMonths = cfg.trainMonths ?? 6;
  const scoreMonths = cfg.scoreMonths ?? 1;
  const stepMonths = cfg.stepMonths ?? 1;
  const folds: WalkForwardFold[] = [];
  for (let i = 0; i < WALK_FORWARD_FOLD_COUNT; i++) {
    const trainStart = addMonths(cfg.windowStart, i * stepMonths);
    const trainEnd = addMonths(trainStart, trainMonths);
    const scoreStart = trainEnd;
    const scoreEnd = addMonths(scoreStart, scoreMonths);
    if (scoreEnd > cfg.windowEnd) {
      throw new Error(
        `walk-forward window too short: fold ${i} score ends at ${scoreEnd.toISOString()} after windowEnd ${cfg.windowEnd.toISOString()}`,
      );
    }
    folds.push({
      index: i,
      trainStart: trainStart.toISOString(),
      trainEnd: trainEnd.toISOString(),
      scoreStart: scoreStart.toISOString(),
      scoreEnd: scoreEnd.toISOString(),
    });
  }
  return folds;
}

export type FoldRunner = (
  fold: WalkForwardFold,
) => Promise<{ metrics: EvalMetrics; ftmoBreaches: FtmoBreach[] }>;

export type WalkForwardRunCfg = {
  windowStart: Date;
  windowEnd: Date;
  baseline: { sortinoRolling60d: number; maxDrawdownPct: number };
  runFold: FoldRunner;
  minTrades?: number;
  liftPct?: number;
};

export async function runWalkForward(
  cfg: WalkForwardRunCfg,
): Promise<{ folds: FoldResult[]; passingFolds: number }> {
  const folds = buildFolds({
    windowStart: cfg.windowStart,
    windowEnd: cfg.windowEnd,
  });
  const out: FoldResult[] = [];
  for (const fold of folds) {
    const { metrics, ftmoBreaches } = await cfg.runFold(fold);
    const decision = isFoldPassing(
      {
        fold,
        metrics,
        ftmoBreaches,
        passed: false,
        reason: null,
      },
      cfg.baseline,
      cfg.minTrades ?? 40,
      cfg.liftPct ?? 5,
    );
    out.push({
      fold,
      metrics,
      ftmoBreaches,
      passed: decision.passed,
      reason: decision.reason,
    });
  }
  const passing = out.filter((f) => f.passed).length;
  return { folds: out, passingFolds: passing };
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}
