import { describe, expect, test } from 'bun:test';
import { HealthSnapshot } from '@ankit-prop/contracts';
import { buildHealthSnapshot } from './health-snapshot.ts';

const FROZEN_START = Date.UTC(2026, 3, 27, 12, 0, 0);
const FROZEN_NOW = FROZEN_START + 5_000;

describe('buildHealthSnapshot', () => {
  test('reports degraded while transport is not-connected (Phase 2.3 default)', () => {
    const snap = buildHealthSnapshot({
      version: '0.1.0',
      startedAtMs: FROZEN_START,
      now: () => FROZEN_NOW,
    });
    expect(snap.service).toBe('ctrader-gateway');
    expect(snap.status).toBe('degraded');
    expect(snap.uptime_seconds).toBe(5);
    expect(snap.details.transport).toBe('not-connected');
    expect(snap.details.rails).toBe('ready');
    expect(() => HealthSnapshot.parse(snap)).not.toThrow();
  });

  test('reports healthy once transport reports connected', () => {
    const snap = buildHealthSnapshot({
      version: '0.1.0',
      startedAtMs: FROZEN_START,
      now: () => FROZEN_NOW,
      transport: () => 'connected',
    });
    expect(snap.status).toBe('healthy');
    expect(snap.details.transport).toBe('connected');
  });

  test('reports unhealthy when a dependency reports unhealthy', () => {
    const snap = buildHealthSnapshot({
      version: '0.1.0',
      startedAtMs: FROZEN_START,
      now: () => FROZEN_NOW,
      transport: () => 'unhealthy',
    });
    expect(snap.status).toBe('unhealthy');
    expect(() => HealthSnapshot.parse(snap)).not.toThrow();
  });
});
