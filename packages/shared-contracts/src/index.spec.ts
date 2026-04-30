import { describe, expect, test } from 'bun:test';
import {
  AnalystOutput,
  GatewayDecision,
  JudgeInput,
  JudgeOutput,
  PersonaConfig,
  PHASE_0_SENTINEL,
  TRADER_ACTIONS,
  TraderOutput,
  V0_TRADER_RUNTIME_ACTIONS,
} from './index.ts';

describe('shared-contracts smoke', () => {
  test('phase-0 sentinel is exported and stable', () => {
    expect(PHASE_0_SENTINEL).toBe('phase-0-scaffold');
  });

  test('persona pipeline contracts are exported from the package barrel', () => {
    expect(AnalystOutput).toBeDefined();
    expect(TraderOutput).toBeDefined();
    expect(JudgeInput).toBeDefined();
    expect(JudgeOutput).toBeDefined();
    expect(PersonaConfig).toBeDefined();
    expect(GatewayDecision).toBeDefined();
    expect(TRADER_ACTIONS).toEqual(['HOLD', 'OPEN', 'CLOSE', 'AMEND']);
    expect(V0_TRADER_RUNTIME_ACTIONS).toEqual(['HOLD', 'OPEN', 'CLOSE']);
  });
});
