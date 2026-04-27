import { STAGE_NAMES } from '@ankit-prop/contracts';
import type { CostBreakdown, StageCost, StageName } from './types.ts';

export const BACKTEST_DEFAULT_USD_CEILING = 50;
export const BACKTEST_PROD_USD_CEILING = 200;
export const AUTORESEARCH_PER_MUTATION_USD_CEILING = 50;

export class CostBudgetExceeded extends Error {
  constructor(
    readonly ceilingUsd: number,
    readonly actualUsd: number,
  ) {
    super(`cost ceiling ${ceilingUsd} USD exceeded; actual ${actualUsd.toFixed(4)}`);
  }
}

export class CostMeter {
  private perStage = new Map<StageName, StageCost>();
  private total = 0;

  constructor(public readonly ceilingUsd: number = BACKTEST_DEFAULT_USD_CEILING) {
    for (const s of STAGE_NAMES) {
      this.perStage.set(s, { input: 0, output: 0, cached: 0 });
    }
  }

  add(stage: StageName, kind: keyof StageCost, usd: number): void {
    const cur = this.perStage.get(stage);
    if (!cur) return;
    cur[kind] += usd;
    if (kind !== 'cached') this.total += usd;
    if (this.total > this.ceilingUsd) {
      throw new CostBudgetExceeded(this.ceilingUsd, this.total);
    }
  }

  totalUsd(): number {
    return this.total;
  }

  snapshot(): CostBreakdown {
    const perStage = {} as CostBreakdown['perStage'];
    for (const [stage, cost] of this.perStage) {
      perStage[stage] = { ...cost };
    }
    return {
      perStage,
      totalUsd: round(this.total, 6),
    };
  }
}

export function emptyCostBreakdown(): CostBreakdown {
  const perStage = {} as CostBreakdown['perStage'];
  for (const s of STAGE_NAMES) {
    perStage[s] = { input: 0, output: 0, cached: 0 };
  }
  return { perStage, totalUsd: 0 };
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
