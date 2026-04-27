import { describe, expect, test } from 'bun:test';
import { PHASE_0_SENTINEL } from './index.ts';

describe('shared-contracts smoke', () => {
  test('phase-0 sentinel is exported and stable', () => {
    expect(PHASE_0_SENTINEL).toBe('phase-0-scaffold');
  });
});
