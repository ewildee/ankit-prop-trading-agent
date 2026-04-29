import { type HealthSnapshot, SERVICES } from '@ankit-prop/contracts';

export type VersionMatrixState = 'current' | 'mismatch' | 'stale' | 'unreachable';
export type VersionMatrixHealthState = HealthSnapshot['status'] | 'unknown';

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
  readonly healthState: VersionMatrixHealthState;
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

export interface VersionTargetSpec {
  readonly name: string;
  readonly defaultHealthUrl: string;
  readonly packageJsonUrl: URL;
}

export interface LoadVersionTargetOptions {
  readonly dashboardPort?: number;
  readonly readPackageVersion?: (packageJsonUrl: URL) => Promise<string>;
}

export interface ProbeVersionMatrixOptions {
  readonly targets?: readonly VersionTarget[];
  readonly fetcher?: VersionMatrixFetcher;
  readonly timeoutMs?: number;
}

export type VersionMatrixFetcher = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<Response>;

export const VERSION_MATRIX_PROBE_TIMEOUT_MS = 1_000;

// BLUEPRINT §17/§19 service ports come from the canonical registry in
// `@ankit-prop/contracts`. Hardcoding the URLs here invites the drift the
// version-matrix is supposed to catch.
const registryHealthUrl = (key: keyof typeof SERVICES): string =>
  `${SERVICES[key].baseUrl}${SERVICES[key].healthPath}`;

export const DEFAULT_VERSION_TARGET_SPECS: readonly VersionTargetSpec[] = [
  {
    name: 'supervisor',
    defaultHealthUrl: registryHealthUrl('supervisor'),
    packageJsonUrl: new URL('../../../packages/proc-supervisor/package.json', import.meta.url),
  },
  {
    name: 'gateway',
    defaultHealthUrl: registryHealthUrl('gateway'),
    packageJsonUrl: new URL('../../ctrader-gateway/package.json', import.meta.url),
  },
  {
    name: 'trader',
    defaultHealthUrl: registryHealthUrl('trader'),
    packageJsonUrl: new URL('../../trader/package.json', import.meta.url),
  },
  {
    name: 'news',
    defaultHealthUrl: registryHealthUrl('news'),
    packageJsonUrl: new URL('../../news/package.json', import.meta.url),
  },
  {
    name: 'dashboard',
    defaultHealthUrl: registryHealthUrl('dashboard'),
    packageJsonUrl: new URL('../package.json', import.meta.url),
  },
];

export async function loadDefaultVersionTargets(
  opts: LoadVersionTargetOptions = {},
): Promise<readonly VersionTarget[]> {
  return loadVersionTargets(DEFAULT_VERSION_TARGET_SPECS, opts);
}

export async function loadVersionTargets(
  specs: readonly VersionTargetSpec[],
  opts: LoadVersionTargetOptions = {},
): Promise<readonly VersionTarget[]> {
  const readPackageVersion = opts.readPackageVersion ?? readPackageJsonVersion;
  return Promise.all(
    specs.map(async (spec) => ({
      name: spec.name,
      healthUrl:
        spec.name === 'dashboard' && opts.dashboardPort
          ? `http://127.0.0.1:${opts.dashboardPort}/health`
          : spec.defaultHealthUrl,
      expectedVersion: await readPackageVersion(spec.packageJsonUrl),
    })),
  );
}

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
        healthState: health?.status ?? 'unknown',
        checkedAt: health?.checked_at ?? generatedAt,
        error: error ?? null,
      };
    }),
  };
}

export async function probeVersionMatrix(
  opts: ProbeVersionMatrixOptions = {},
): Promise<VersionMatrixSnapshot> {
  const targets = opts.targets ?? (await loadDefaultVersionTargets());
  const fetcher = opts.fetcher ?? ((url, init) => fetch(url, init));
  const timeoutMs = opts.timeoutMs ?? VERSION_MATRIX_PROBE_TIMEOUT_MS;
  const results = await Promise.all(
    targets.map((target) => probeTarget(target, fetcher, timeoutMs)),
  );
  return buildVersionMatrixSnapshot(results);
}

async function probeTarget(
  target: VersionTarget,
  fetcher: VersionMatrixFetcher,
  timeoutMs: number,
): Promise<VersionProbeResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort();
  }, timeoutMs);
  try {
    const res = await fetcher(target.healthUrl, { signal: ctrl.signal });
    if (!res.ok) {
      return { target, health: null, error: `HTTP ${res.status}` };
    }
    return { target, health: (await res.json()) as HealthSnapshot };
  } catch (err) {
    const e = err as Error;
    if (e.name === 'AbortError') {
      return { target, health: null, error: `timeout after ${timeoutMs}ms` };
    }
    return { target, health: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function readPackageJsonVersion(packageJsonUrl: URL): Promise<string> {
  const body = (await Bun.file(packageJsonUrl).json()) as { version?: unknown };
  if (typeof body.version !== 'string' || body.version.length === 0) {
    throw new Error(`missing package version: ${packageJsonUrl.pathname}`);
  }
  return body.version;
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
