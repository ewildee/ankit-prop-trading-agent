import { describe, expect, test } from 'bun:test';
import {
  buildVersionMatrixSnapshot,
  classifyVersion,
  type VersionProbeResult,
} from './version-matrix.ts';

const CHECKED_AT = '2026-04-28T21:00:00.000Z';

describe('classifyVersion', () => {
  test('marks exact package version as current', () => {
    expect(classifyVersion('0.3.1', '0.3.1')).toBe('current');
  });

  test('marks older running package version as stale', () => {
    expect(classifyVersion('0.3.0', '0.3.1')).toBe('stale');
  });

  test('marks non-stale version drift as mismatch', () => {
    expect(classifyVersion('0.3.2', '0.3.1')).toBe('mismatch');
  });
});

describe('buildVersionMatrixSnapshot', () => {
  test('preserves stale and mismatch rows for banner highlighting', () => {
    const snapshot = buildVersionMatrixSnapshot(
      [result('gateway', '0.3.0', '0.3.1'), result('news', '0.2.5', '0.2.4')],
      () => CHECKED_AT,
    );

    expect(snapshot.rows).toMatchObject([
      { name: 'gateway', runningVersion: '0.3.0', expectedVersion: '0.3.1', state: 'stale' },
      { name: 'news', runningVersion: '0.2.5', expectedVersion: '0.2.4', state: 'mismatch' },
    ]);
  });

  test('marks failed probes as unreachable', () => {
    const snapshot = buildVersionMatrixSnapshot(
      [
        {
          target: {
            name: 'trader',
            healthUrl: 'http://127.0.0.1:9202/health',
            expectedVersion: '0.1.0',
          },
          health: null,
          error: 'connection refused',
        },
      ],
      () => CHECKED_AT,
    );

    expect(snapshot.rows[0]).toMatchObject({
      name: 'trader',
      runningVersion: null,
      state: 'unreachable',
      error: 'connection refused',
    });
  });
});

function result(name: string, runningVersion: string, expectedVersion: string): VersionProbeResult {
  return {
    target: {
      name,
      healthUrl: `http://127.0.0.1/${name}`,
      expectedVersion,
    },
    health: {
      service: name,
      version: runningVersion,
      bun_version: '1.3.13',
      status: 'healthy',
      started_at: CHECKED_AT,
      uptime_seconds: 1,
      pid: 123,
      details: {},
      checked_at: CHECKED_AT,
    },
  };
}
