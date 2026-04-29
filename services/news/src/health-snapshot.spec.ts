import { describe, expect, test } from 'bun:test';
import { HealthSnapshot } from '@ankit-prop/contracts';
import { buildNewsHealthSnapshot } from './health-snapshot.ts';

const STARTED_AT_MS = Date.UTC(2026, 3, 29, 12, 0, 0);
const CHECKED_AT_MS = STARTED_AT_MS + 5_000;

describe('buildNewsHealthSnapshot', () => {
  test('reports healthy when DB is ok and calendar is fresh', () => {
    const snap = buildNewsHealthSnapshot({
      version: '0.4.1',
      startedAtMs: STARTED_AT_MS,
      fetcherHealth: {
        dbOk: true,
        lastFetchAt: '2026-04-29T11:59:00.000Z',
        ageSeconds: 60,
      },
      now: () => CHECKED_AT_MS,
    });

    expect(snap.service).toBe('news');
    expect(snap.status).toBe('healthy');
    expect(snap.version).toBe('0.4.1');
    expect(snap.bun_version).toBe(Bun.version);
    expect(snap.started_at).toBe('2026-04-29T12:00:00.000Z');
    expect(snap.uptime_seconds).toBe(5);
    expect(snap.pid).toBe(process.pid);
    expect(snap.details).toEqual({
      dbOk: true,
      lastFetchAt: '2026-04-29T11:59:00.000Z',
      ageSeconds: 60,
      blueprint_section: '19.0',
    });
    expect(snap.checked_at).toBe('2026-04-29T12:00:05.000Z');
    expect(() => HealthSnapshot.parse(snap)).not.toThrow();
  });

  test('reports degraded when the calendar is stale', () => {
    const snap = buildNewsHealthSnapshot({
      version: '0.4.1',
      startedAtMs: STARTED_AT_MS,
      fetcherHealth: {
        dbOk: true,
        lastFetchAt: '2026-04-29T09:59:59.000Z',
        ageSeconds: 7201,
      },
      now: () => CHECKED_AT_MS,
    });

    expect(snap.status).toBe('degraded');
    expect(() => HealthSnapshot.parse(snap)).not.toThrow();
  });

  test('reports degraded during cold start before a successful fetch', () => {
    const snap = buildNewsHealthSnapshot({
      version: '0.4.1',
      startedAtMs: STARTED_AT_MS,
      fetcherHealth: {
        dbOk: true,
        lastFetchAt: null,
        ageSeconds: null,
      },
      now: () => CHECKED_AT_MS,
    });

    expect(snap.status).toBe('degraded');
    expect(snap.details.lastFetchAt).toBeNull();
    expect(snap.details.ageSeconds).toBeNull();
    expect(() => HealthSnapshot.parse(snap)).not.toThrow();
  });

  test('reports unhealthy when DB is not ok', () => {
    const snap = buildNewsHealthSnapshot({
      version: '0.4.1',
      startedAtMs: STARTED_AT_MS,
      fetcherHealth: {
        dbOk: false,
        lastFetchAt: '2026-04-29T11:59:00.000Z',
        ageSeconds: 60,
      },
      now: () => CHECKED_AT_MS,
    });

    expect(snap.status).toBe('unhealthy');
    expect(() => HealthSnapshot.parse(snap)).not.toThrow();
  });
});
