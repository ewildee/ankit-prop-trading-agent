// BLUEPRINT §19.1 — pure `ctrader-gateway` /health snapshot builder.
//
// Phase 2.3 ships only the rails subsystem; transport / OAuth / order
// manager land in ANKA-13 / ANKA-15. Until then the service deliberately
// reports `status: 'degraded'` by default so operators never see a false
// green while the broker transport is still absent.

import type { HealthSnapshot, HealthStatus } from '@ankit-prop/contracts';

export type DependencyState = 'connected' | 'not-connected' | 'ready' | 'pending' | 'unhealthy';

export interface HealthDeps {
  readonly version: string;
  readonly startedAtMs: number;
  readonly transport?: () => DependencyState;
  readonly rails?: () => DependencyState;
  readonly now?: () => number;
}

export function buildHealthSnapshot(deps: HealthDeps): HealthSnapshot {
  const now = (deps.now ?? Date.now)();
  const transport = deps.transport ? deps.transport() : 'not-connected';
  const rails = deps.rails ? deps.rails() : 'ready';

  // Status mapping: unavailable dependencies degrade readiness; explicit
  // unhealthy dependency signals become the hard-fail status used by HTTP 503.
  let status: HealthStatus = 'healthy';
  if (transport === 'unhealthy' || rails === 'unhealthy') {
    status = 'unhealthy';
  } else if (transport === 'not-connected' || transport === 'pending' || rails === 'pending') {
    status = 'degraded';
  }

  return {
    service: 'ctrader-gateway',
    version: deps.version,
    bun_version: Bun.version,
    status,
    started_at: new Date(deps.startedAtMs).toISOString(),
    uptime_seconds: Math.max(0, Math.floor((now - deps.startedAtMs) / 1000)),
    pid: process.pid,
    details: { transport, rails, blueprint_section: '19.1' },
    checked_at: new Date(now).toISOString(),
  };
}
