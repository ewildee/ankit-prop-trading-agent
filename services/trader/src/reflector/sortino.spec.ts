import { describe, expect, test } from 'bun:test';
import { computeSortinoRolling60d } from './sortino.ts';

describe('computeSortinoRolling60d', () => {
  test('computes deterministic rolling-60d Sortino from realised PnL points', () => {
    const result = computeSortinoRolling60d(
      [
        { closedAt: '2026-04-01T00:00:00.000Z', realizedPnl: 100 },
        { closedAt: '2026-04-02T00:00:00.000Z', realizedPnl: -50 },
        { closedAt: '2026-04-03T00:00:00.000Z', realizedPnl: 25 },
        { closedAt: '2026-04-04T00:00:00.000Z', realizedPnl: -25 },
      ],
      { asOf: '2026-04-04T00:00:00.000Z' },
    );

    expect(result.sampleCount).toBe(4);
    expect(result.downsideSampleCount).toBe(2);
    expect(result.sortinoRolling60d).toBeCloseTo(0.316227766, 9);
  });
});
