import type { Bar, SlippageModelCfg } from './types.ts';

export type AtrCalcInput = ReadonlyArray<Bar>;

export function atr14(bars: AtrCalcInput, atIndex: number, period = 14): number {
  if (atIndex < 1) return 0;
  const start = Math.max(1, atIndex - period + 1);
  let sum = 0;
  let n = 0;
  for (let i = start; i <= atIndex; i++) {
    const cur = bars[i];
    const prev = bars[i - 1];
    if (!cur || !prev) continue;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );
    sum += tr;
    n += 1;
  }
  if (n === 0) return 0;
  return sum / n;
}

export function maxFillSlippage(typicalSpread: number, atr: number): number {
  return Math.max(2 * typicalSpread, 0.5 * atr);
}

export function effectiveSpreadPips(
  cfg: SlippageModelCfg,
  symbol: string,
  inNewsWindow: boolean,
): number {
  const base = cfg.baseSpreadPipsBySymbol[symbol] ?? 1;
  return inNewsWindow ? base * cfg.newsSpreadMultiplier : base;
}

export function applySlippage(
  fillPrice: number,
  side: 'long' | 'short',
  pipSize: number,
  worstCasePips: number,
): number {
  const slip = worstCasePips * pipSize;
  return side === 'long' ? fillPrice + slip : fillPrice - slip;
}
