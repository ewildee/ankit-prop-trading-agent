import { describe, expect, test } from 'bun:test';
import { DecisionRecord, type JudgeOutput, type TraderOutput } from '@ankit-prop/contracts';
import type { Bar } from '@ankit-prop/market-data';
import { createInProcessReplayGateway } from '../gateway/in-process.ts';
import { loadPersonaConfig } from '../persona-config/loader.ts';
import { runDecision } from './runner.ts';
import type { JudgeStage, PipelineDeps, TraderStage } from './stages.ts';
import { createAnalystStub } from './stubs/analyst.stub.ts';
import { createJudgeStub } from './stubs/judge.stub.ts';
import { createReflectorStub } from './stubs/reflector.stub.ts';
import { createTraderStub } from './stubs/trader.stub.ts';

const BAR: Bar = {
  symbol: 'XAUUSD',
  timeframe: '5m',
  tsStart: Date.parse('2026-04-27T14:30:00.000Z'),
  tsEnd: Date.parse('2026-04-27T14:35:00.000Z'),
  open: 2331.25,
  high: 2333.5,
  low: 2330.75,
  close: 2332.1,
  volume: 1200,
};

const ZERO_CACHE_STATS = {
  inputCachedTokens: 0,
  inputFreshTokens: 0,
  inputCacheWriteTokens: 0,
  outputTokens: 0,
  thinkingTokens: 0,
} as const;

describe('runDecision', () => {
  test('default stubs produce a parseable HOLD decision without judge evaluation', async () => {
    const record = await runDecision(BAR, await loadPersonaConfig(), {
      ...baseDeps(),
      judge: throwingJudge(),
    });

    expect(() => DecisionRecord.parse(record)).not.toThrow();
    expect(record.traderOutput.action).toBe('HOLD');
    expect(record.judgeOutput).toBeNull();
    expect(record.gatewayDecision?.status).toBe('not_submitted');
    if (record.gatewayDecision?.status === 'not_submitted') {
      expect(record.gatewayDecision.reason).toBe('hold');
    }
  });

  test('OPEN with judge reject produces not_submitted judge telemetry', async () => {
    const record = await runDecision(BAR, await loadPersonaConfig(), {
      ...baseDeps(),
      trader: traderWith(openOutput()),
      judge: judgeWith({
        verdict: 'REJECT',
        reason: 'stub',
        rejectedRules: [],
        cacheStats: ZERO_CACHE_STATS,
      }),
    });

    expect(() => DecisionRecord.parse(record)).not.toThrow();
    expect(record.traderOutput.action).toBe('OPEN');
    expect(record.judgeOutput?.verdict).toBe('REJECT');
    expect(record.gatewayDecision?.status).toBe('not_submitted');
    if (record.gatewayDecision?.status === 'not_submitted') {
      expect(record.gatewayDecision.reason).toBe('judge_reject');
    }
  });

  test('OPEN after judge approve reaches the replay gateway submitted path', async () => {
    const record = await runDecision(BAR, await loadPersonaConfig(), {
      ...baseDeps(),
      trader: traderWith(openOutput()),
      judge: judgeWith({
        verdict: 'APPROVE',
        reason: 'stub',
        cacheStats: ZERO_CACHE_STATS,
      }),
    });

    expect(() => DecisionRecord.parse(record)).not.toThrow();
    expect(record.traderOutput.action).toBe('OPEN');
    expect(record.judgeOutput?.verdict).toBe('APPROVE');
    expect(record.gatewayDecision?.status).toBe('submitted');
    if (record.gatewayDecision?.status === 'submitted') {
      expect(record.gatewayDecision.railVerdict.outcome).toBe('allow');
    }
  });

  test('CLOSE after judge approve also reaches the replay gateway', async () => {
    const record = await runDecision(BAR, await loadPersonaConfig(), {
      ...baseDeps(),
      trader: traderWith({
        action: 'CLOSE',
        idempotencyKey: 'close-test',
        positionId: 'position-test',
        rationale: 'stub',
        cacheStats: ZERO_CACHE_STATS,
      }),
      judge: judgeWith({
        verdict: 'APPROVE',
        reason: 'stub',
        cacheStats: ZERO_CACHE_STATS,
      }),
    });

    expect(() => DecisionRecord.parse(record)).not.toThrow();
    expect(record.traderOutput.action).toBe('CLOSE');
    expect(record.gatewayDecision?.status).toBe('submitted');
  });
});

function baseDeps(): PipelineDeps {
  return {
    runId: 'runner-spec',
    analyst: createAnalystStub(),
    trader: createTraderStub(),
    judge: createJudgeStub(),
    gateway: createInProcessReplayGateway(),
    reflector: createReflectorStub(),
  };
}

function openOutput(): TraderOutput {
  return {
    action: 'OPEN',
    idempotencyKey: 'open-test',
    side: 'BUY',
    size: { lots: 0.01, pctEquity: 0.001 },
    entry: { type: 'market' },
    stopLossPips: 120,
    takeProfitPips: 240,
    rationale: 'stub',
    expectedRR: 2,
    cacheStats: ZERO_CACHE_STATS,
  };
}

function traderWith(output: TraderOutput): TraderStage {
  return { decide: () => output };
}

function judgeWith(output: JudgeOutput): JudgeStage {
  return { evaluate: () => output };
}

function throwingJudge(): JudgeStage {
  return {
    evaluate() {
      throw new Error('judge should not run for HOLD');
    },
  };
}
