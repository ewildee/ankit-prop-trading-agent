import type { HealthSnapshot } from '@ankit-prop/contracts';
import supervisorPkg from '../../../packages/proc-supervisor/package.json' with { type: 'json' };
import gatewayPkg from '../../ctrader-gateway/package.json' with { type: 'json' };
import newsPkg from '../../news/package.json' with { type: 'json' };
import traderPkg from '../../trader/package.json' with { type: 'json' };
import dashboardPkg from '../package.json' with { type: 'json' };

export type VersionMatrixState = 'current' | 'mismatch' | 'stale' | 'unreachable';

export interface VersionTarget {
  readonly name: string;
  readonly healthUrl: string;
  readonly expectedVersion: string;
}

export interface VersionMatrixRow {
  readonly name: string;
  readonly healthUrl: string;
  readonly expectedVersion: string;
  readonly runningVersion: string | null;
  readonly state: VersionMatrixState;
  readonly healthStatus: HealthSnapshot['status'] | null;
  readonly checkedAt: string;
  readonly error: string | null;
}

export interface VersionMatrixSnapshot {
  readonly generatedAt: string;
  readonly rows: readonly VersionMatrixRow[];
}

export interface VersionProbeResult {
  readonly target: VersionTarget;
  readonly health: HealthSnapshot | null;
  readonly error?: string;
}

export const DEFAULT_VERSION_TARGETS: readonly VersionTarget[] = [
  {
    name: 'supervisor',
    healthUrl: 'http://127.0.0.1:9100/health',
    expectedVersion: supervisorPkg.version,
  },
  {
    name: 'gateway',
    healthUrl: 'http://127.0.0.1:9201/health',
    expectedVersion: gatewayPkg.version,
  },
  {
    name: 'trader',
    healthUrl: 'http://127.0.0.1:9202/health',
    expectedVersion: traderPkg.version,
  },
  {
    name: 'news',
    healthUrl: 'http://127.0.0.1:9203/health',
    expectedVersion: newsPkg.version,
  },
  {
    name: 'dashboard',
    healthUrl: 'http://127.0.0.1:9601/health',
    expectedVersion: dashboardPkg.version,
  },
];

export function classifyVersion(
  runningVersion: string | null,
  expectedVersion: string,
): VersionMatrixState {
  if (!runningVersion) return 'unreachable';
  if (runningVersion === expectedVersion) return 'current';
  if (compareSemver(runningVersion, expectedVersion) < 0) return 'stale';
  return 'mismatch';
}

export function buildVersionMatrixSnapshot(
  results: readonly VersionProbeResult[],
  now: () => string = () => new Date().toISOString(),
): VersionMatrixSnapshot {
  const generatedAt = now();
  return {
    generatedAt,
    rows: results.map(({ target, health, error }) => {
      const runningVersion = health?.version ?? null;
      return {
        name: target.name,
        healthUrl: target.healthUrl,
        expectedVersion: target.expectedVersion,
        runningVersion,
        state: error ? 'unreachable' : classifyVersion(runningVersion, target.expectedVersion),
        healthStatus: health?.status ?? null,
        checkedAt: health?.checked_at ?? generatedAt,
        error: error ?? null,
      };
    }),
  };
}

export async function probeVersionMatrix(
  targets: readonly VersionTarget[] = DEFAULT_VERSION_TARGETS,
  fetcher: typeof fetch = fetch,
): Promise<VersionMatrixSnapshot> {
  const results = await Promise.all(targets.map((target) => probeTarget(target, fetcher)));
  return buildVersionMatrixSnapshot(results);
}

async function probeTarget(
  target: VersionTarget,
  fetcher: typeof fetch,
): Promise<VersionProbeResult> {
  try {
    const res = await fetcher(target.healthUrl);
    if (!res.ok) {
      return { target, health: null, error: `HTTP ${res.status}` };
    }
    return { target, health: (await res.json()) as HealthSnapshot };
  } catch (err) {
    return { target, health: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function compareSemver(left: string, right: string): number {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);
  if (!leftParts || !rightParts) return 1;

  for (let idx = 0; idx < leftParts.length; idx += 1) {
    const delta = (leftParts[idx] ?? 0) - (rightParts[idx] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function parseSemver(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
