import { describe, expect, test } from 'bun:test';
import { HealthSnapshot } from '@ankit-prop/contracts';
import { buildDashboardHealthSnapshot } from './health-server.ts';

const STARTED_AT = Date.UTC(2026, 3, 28, 21, 0, 0);
const NOW = STARTED_AT + 12_000;

describe('buildDashboardHealthSnapshot', () => {
  test('loads dashboard version into the shared health shape', () => {
    const snapshot = buildDashboardHealthSnapshot({
      version: '0.1.0',
      startedAtMs: STARTED_AT,
      versionTargets: 5,
      now: () => NOW,
    });

    expect(snapshot.service).toBe('dashboard');
    expect(snapshot.version).toBe('0.1.0');
    expect(snapshot.uptime_seconds).toBe(12);
    expect(snapshot.details['version_matrix_targets']).toBe(5);
    expect(() => HealthSnapshot.parse(snapshot)).not.toThrow();
  });
});
