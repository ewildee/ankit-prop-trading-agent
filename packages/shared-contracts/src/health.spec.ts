import { describe, expect, test } from 'bun:test';
import { AggregatedHealth, HealthSnapshot, loadVersionFromPkgJson } from './health.ts';

describe('HealthSnapshot', () => {
  test('accepts a minimal valid snapshot', () => {
    const snap = HealthSnapshot.parse({
      service: 'news',
      version: '0.0.1',
      bun_version: '1.3.13',
      status: 'healthy',
      started_at: '2026-04-27T16:00:00+02:00',
      uptime_seconds: 3,
      pid: 1234,
      details: {},
      checked_at: '2026-04-27T16:00:03+02:00',
    });
    expect(snap.service).toBe('news');
  });

  test('rejects unknown status', () => {
    expect(() =>
      HealthSnapshot.parse({
        service: 'news',
        version: '0.0.1',
        bun_version: '1.3.13',
        status: 'on-fire',
        started_at: '2026-04-27T16:00:00+02:00',
        uptime_seconds: 0,
        pid: 1,
        details: {},
        checked_at: '2026-04-27T16:00:00+02:00',
      }),
    ).toThrow();
  });

  test('rejects extra keys in strict mode', () => {
    expect(() =>
      HealthSnapshot.parse({
        service: 'news',
        version: '0.0.1',
        bun_version: '1.3.13',
        status: 'healthy',
        started_at: '2026-04-27T16:00:00+02:00',
        uptime_seconds: 0,
        pid: 1,
        details: {},
        checked_at: '2026-04-27T16:00:00+02:00',
        extra: 'field',
      }),
    ).toThrow();
  });
});

describe('AggregatedHealth', () => {
  test('accepts a minimal aggregated snapshot with one service', () => {
    const agg = AggregatedHealth.parse({
      service: 'proc-supervisor',
      version: '0.1.0',
      bun_version: '1.3.13',
      status: 'healthy',
      started_at: '2026-04-27T16:00:00+02:00',
      uptime_seconds: 5,
      pid: 1,
      checked_at: '2026-04-27T16:00:05+02:00',
      mode: 'dev',
      services: [
        {
          name: 'news',
          state: 'running',
          pid: 9999,
          adopted: false,
          startedAt: '2026-04-27T16:00:01+02:00',
          restartCount: 0,
          crashesInWindow: 0,
          lastExitCode: null,
          lastError: null,
          health: null,
        },
      ],
    });
    expect(agg.services).toHaveLength(1);
  });
});

describe('loadVersionFromPkgJson', () => {
  test('returns the version when present', () => {
    expect(loadVersionFromPkgJson({ version: '1.2.3' })).toBe('1.2.3');
  });
  test('throws on missing version', () => {
    expect(() => loadVersionFromPkgJson({})).toThrow();
  });
});
