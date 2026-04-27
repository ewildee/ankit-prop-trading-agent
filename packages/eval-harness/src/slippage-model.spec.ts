import { describe, expect, test } from 'bun:test';
import { applySlippage, atr14, effectiveSpreadPips, maxFillSlippage } from './slippage-model.ts';
import type { Bar, SlippageModelCfg } from './types.ts';

function bar(i: number, high: number, low: number, close: number): Bar {
  return {
    symbol: 'XAUUSD',
    timeframe: '5m',
    tsStart: i * 60_000,
    tsEnd: (i + 1) * 60_000,
    open: low,
    high,
    low,
    close,
    volume: 1,
  };
}

describe('slippage-model', () => {
  test('atr14 returns true range average', () => {
    const bars: Bar[] = [];
    for (let i = 0; i < 16; i++) bars.push(bar(i, 100 + i, 100 + i - 2, 100 + i - 1));
    const v = atr14(bars, 15, 14);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(5);
  });

  test('atr14 handles index < 1', () => {
    expect(atr14([bar(0, 100, 99, 99.5)], 0)).toBe(0);
  });

  test('maxFillSlippage = max(2 * spread, 0.5 * ATR(14)) per BLUEPRINT §14.6', () => {
    expect(maxFillSlippage(2, 1)).toBe(4);
    expect(maxFillSlippage(0.5, 10)).toBe(5);
  });

  test('effectiveSpreadPips applies news multiplier', () => {
    const cfg: SlippageModelCfg = {
      baseSpreadPipsBySymbol: { XAUUSD: 2 },
      newsSpreadMultiplier: 5,
      fillLatencyMs: 200,
      worstCaseSlippagePips: 3,
    };
    expect(effectiveSpreadPips(cfg, 'XAUUSD', false)).toBe(2);
    expect(effectiveSpreadPips(cfg, 'XAUUSD', true)).toBe(10);
  });

  test('applySlippage moves price against fill direction', () => {
    expect(applySlippage(2050, 'long', 0.1, 3)).toBeCloseTo(2050.3, 5);
    expect(applySlippage(2050, 'short', 0.1, 3)).toBeCloseTo(2049.7, 5);
  });
});
