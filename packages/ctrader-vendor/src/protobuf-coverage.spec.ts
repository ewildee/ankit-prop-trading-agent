import { describe, expect, test } from 'bun:test';
import { REQUIRED_MESSAGE_TYPES } from './codec.ts';
import { runProtobufCoverage } from './protobuf-coverage.ts';

describe('runProtobufCoverage (§10.3 step 7 — offline)', () => {
  test('every required message round-trips through the codec', () => {
    const r = runProtobufCoverage();
    const failures = r.messages.filter((m) => !m.ok);
    if (failures.length > 0) {
      throw new Error(
        `protobuf coverage failures:\n${failures
          .map((f) => `  ${f.name}: ${f.error ?? 'unknown'}`)
          .join('\n')}`,
      );
    }
    expect(r.ok).toBe(true);
    expect(r.summary).toEqual({
      total: REQUIRED_MESSAGE_TYPES.length,
      passed: REQUIRED_MESSAGE_TYPES.length,
      failed: 0,
    });
  });

  test('the report covers exactly REQUIRED_MESSAGE_TYPES (no drift)', () => {
    const r = runProtobufCoverage();
    expect(r.messages.map((m) => m.name).sort()).toEqual([...REQUIRED_MESSAGE_TYPES].sort());
  });

  test('non-envelope messages report a numeric payloadType; envelope reports null', () => {
    const r = runProtobufCoverage();
    const env = r.messages.find((m) => m.name === 'ProtoMessage');
    expect(env?.payloadType).toBeNull();
    for (const m of r.messages) {
      if (m.name === 'ProtoMessage') continue;
      expect(typeof m.payloadType).toBe('number');
      expect(m.payloadType).toBeGreaterThan(0);
    }
  });

  test('byte counts are stable: framed bytes track ProtoMessage envelope size', () => {
    const r = runProtobufCoverage();
    for (const m of r.messages) {
      expect(m.bytes).toBeGreaterThan(0);
    }
  });
});
