import { describe, expect, test } from 'bun:test';
import { AggregatedHealth } from '@ankit-prop/contracts';
import { buildAggregatedHealth } from './aggregated-health.ts';
import type { ProcessManager } from './process-manager.ts';
import { SupervisorCfg } from './types.ts';

function fakeManager(name: string, state: 'running' | 'crashed' | 'unhealthy'): ProcessManager {
  return {
    cfg: { name },
    getStatus: () => ({
      name,
      state,
      pid: 9999,
      adopted: false,
      startedAt: '2026-04-27T16:00:00+02:00',
      restartCount: 0,
      crashesInWindow: 0,
      lastExitCode: null,
      lastError: null,
      health: null,
    }),
    recentLogs: () => [],
  } as unknown as ProcessManager;
}

const cfg = SupervisorCfg.parse({
  mode: 'dev',
  port: 9100,
  services: [
    {
      name: 'a',
      cmd: 'bun run a.ts',
      health: { url: 'http://localhost:1/health' },
    },
  ],
});

describe('buildAggregatedHealth', () => {
  test('healthy when all services running', () => {
    const snap = buildAggregatedHealth({
      managers: () => [fakeManager('a', 'running')],
      cfg,
      supervisorVersion: '0.1.0',
      startedAt: Date.now() - 1000,
    });
    AggregatedHealth.parse(snap);
    expect(snap.status).toBe('healthy');
  });

  test('degraded when a service is unhealthy', () => {
    const snap = buildAggregatedHealth({
      managers: () => [fakeManager('a', 'running'), fakeManager('b', 'unhealthy')],
      cfg,
      supervisorVersion: '0.1.0',
      startedAt: Date.now(),
    });
    expect(snap.status).toBe('degraded');
  });

  test('unhealthy when a service has crashed', () => {
    const snap = buildAggregatedHealth({
      managers: () => [fakeManager('a', 'crashed')],
      cfg,
      supervisorVersion: '0.1.0',
      startedAt: Date.now(),
    });
    expect(snap.status).toBe('unhealthy');
  });
});
