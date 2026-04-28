import type { HealthSnapshot } from '@ankit-prop/contracts';

export interface DashboardHealthDeps {
  readonly version: string;
  readonly startedAtMs: number;
  readonly versionTargets: number;
  readonly now?: () => number;
}

export function buildDashboardHealthSnapshot(deps: DashboardHealthDeps): HealthSnapshot {
  const now = (deps.now ?? Date.now)();
  return {
    service: 'dashboard',
    version: deps.version,
    bun_version: Bun.version,
    status: 'healthy',
    started_at: new Date(deps.startedAtMs).toISOString(),
    uptime_seconds: Math.max(0, Math.floor((now - deps.startedAtMs) / 1000)),
    pid: process.pid,
    details: {
      static_assets: 'ready',
      version_matrix_targets: deps.versionTargets,
      blueprint_section: '16.0',
    },
    checked_at: new Date(now).toISOString(),
  };
}
