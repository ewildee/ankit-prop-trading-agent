import { describe, expect, test } from 'bun:test';
import type { Bar } from '@ankit-prop/market-data';
import { loadPersonaConfig } from '../persona-config/loader.ts';
import { scoreConfluence } from './confluence-score.ts';

describe('scoreConfluence', () => {
  test('returns a deterministic 0 score for unknown regimes', async () => {
    const params = await loadPersonaConfig();
    const result = scoreConfluence({
      regimeLabel: 'unknown',
      recentBars: barsFromCloses([2300, 2301, 2302]),
      params,
    });

    expect(result.score).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.regimeNote).toContain('unknown');
  });

  test('combines timeframe agreement and indicator alignment into confidence', async () => {
    const params = await loadPersonaConfig();
    const first = scoreConfluence({
      regimeLabel: 'A_session_break',
      recentBars: barsFromCloses([2300, 2301, 2302, 2304, 2306, 2308]),
      params,
    });
    const second = scoreConfluence({
      regimeLabel: 'A_session_break',
      recentBars: barsFromCloses([2300, 2301, 2302, 2304, 2306, 2308]),
      params,
    });

    expect(first).toEqual(second);
    expect(first.score).toBeGreaterThan(50);
    expect(first.confidence).toBe(first.score / 100);
    expect(first.regimeNote).toContain('tf=');
    expect(first.regimeNote).toContain('ind=');
  });
});

function barsFromCloses(closes: number[]): Bar[] {
  const start = Date.parse('2026-04-30T14:00:00.000Z');
  return closes.map((close, index) => ({
    symbol: 'XAUUSD',
    timeframe: '5m',
    tsStart: start + index * 300_000,
    tsEnd: start + (index + 1) * 300_000,
    open: close - 0.2,
    high: close + 0.3,
    low: close - 0.4,
    close,
    volume: 1000 + index,
  }));
}
