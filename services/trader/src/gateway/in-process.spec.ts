import { describe, expect, test } from 'bun:test';
import type { CalendarItem, JudgeOutput, TraderOpenOutput } from '@ankit-prop/contracts';
import type { Bar } from '@ankit-prop/market-data';
import { ZERO } from '../analyst/constants.ts';
import { loadPersonaConfig } from '../persona-config/loader.ts';
import { createInProcessReplayGateway } from './in-process.ts';

const ZERO_CACHE_STATS = {
  inputCachedTokens: ZERO,
  inputFreshTokens: ZERO,
  inputCacheWriteTokens: ZERO,
  outputTokens: ZERO,
  thinkingTokens: ZERO,
} as const;

const JUDGE_APPROVE: JudgeOutput = {
  verdict: 'APPROVE',
  reason: 'fixture',
  cacheStats: ZERO_CACHE_STATS,
};

describe('createInProcessReplayGateway', () => {
  test('blocks an approved OPEN during a restricted five-minute news blackout', async () => {
    const persona = await loadPersonaConfig();
    const bar = barAt('2026-04-27T14:30:00.000Z');
    const gateway = createInProcessReplayGateway({
      calendarContext: () => ({
        calendarLookahead: [
          calendarItem(persona.instrument, new Date(bar.tsEnd + 5 * 60 * 1000).toISOString()),
        ],
      }),
    });

    const decision = await gateway.decide({
      bar,
      persona,
      context: contextAt(bar.tsEnd),
      analystOutput: {} as never,
      traderOutput: openOutput(),
      judgeOutput: JUDGE_APPROVE,
    });

    expect(decision.status).toBe('not_submitted');
    if (decision.status === 'not_submitted') {
      expect(decision.reason).toBe('rail_block');
      expect(decision.railVerdict?.outcome).toBe('reject');
      expect(decision.railVerdict?.decisions).toContainEqual(
        expect.objectContaining({
          rail: 'news_blackout_5m',
          outcome: 'reject',
          reason: 'restricted_event_blackout',
        }),
      );
    }
  });

  test('blocks an approved OPEN outside the persona active window', async () => {
    const persona = await loadPersonaConfig();
    const bar = barAt('2026-04-27T03:00:00.000Z');
    const decision = await createInProcessReplayGateway().decide({
      bar,
      persona,
      context: contextAt(bar.tsEnd),
      analystOutput: {} as never,
      traderOutput: openOutput(),
      judgeOutput: JUDGE_APPROVE,
    });

    expect(decision.status).toBe('not_submitted');
    if (decision.status === 'not_submitted') {
      expect(decision.reason).toBe('rail_block');
      expect(decision.railVerdict?.outcome).toBe('reject');
      expect(decision.railVerdict?.decisions).toContainEqual(
        expect.objectContaining({
          rail: 'force_flat_schedule',
          outcome: 'reject',
          reason: 'outside_active_window',
        }),
      );
    }
  });
});

function barAt(tsStartIso: string): Bar {
  const tsStart = Date.parse(tsStartIso);
  return {
    symbol: 'XAUUSD',
    timeframe: '5m',
    tsStart,
    tsEnd: tsStart + 5 * 60 * 1000,
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1000,
  };
}

function contextAt(tsEnd: number) {
  return {
    runId: 'gateway-in-process-spec',
    paramsHash: 'fixture',
    decidedAt: new Date(tsEnd).toISOString(),
  };
}

function openOutput(): TraderOpenOutput {
  return {
    action: 'OPEN',
    idempotencyKey: 'open-fixture',
    side: 'BUY',
    size: { lots: 0.01, pctEquity: 0.5 },
    entry: { type: 'market' },
    stopLossPips: 50,
    takeProfitPips: 100,
    rationale: 'fixture',
    expectedRR: 2,
    cacheStats: ZERO_CACHE_STATS,
  };
}

function calendarItem(instrument: string, date: string): CalendarItem {
  return {
    title: 'restricted fixture',
    impact: 'high',
    instrument,
    restriction: true,
    eventType: 'macro',
    date,
    forecast: null,
    previous: null,
    actual: null,
    youtubeLink: null,
    articleLink: null,
  };
}
