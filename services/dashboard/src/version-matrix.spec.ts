import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SERVICES } from '@ankit-prop/contracts';
import {
  buildVersionMatrixSnapshot,
  classifyVersion,
  DEFAULT_VERSION_TARGET_SPECS,
  loadVersionTargets,
  probeVersionMatrix,
  type VersionMatrixFetcher,
  type VersionProbeResult,
  type VersionTarget,
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

  test('surfaces degraded and unhealthy health status for banner styling', () => {
    const snapshot = buildVersionMatrixSnapshot(
      [
        result('gateway', '0.3.1', '0.3.1', 'degraded'),
        result('news', '0.3.1', '0.3.1', 'unhealthy'),
      ],
      () => CHECKED_AT,
    );

    expect(snapshot.rows).toMatchObject([
      { name: 'gateway', state: 'current', healthStatus: 'degraded', healthState: 'degraded' },
      { name: 'news', state: 'current', healthStatus: 'unhealthy', healthState: 'unhealthy' },
    ]);
  });
});

describe('loadVersionTargets', () => {
  test('re-reads package.json versions instead of holding module-start constants', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-version-target-'));
    const packagePath = join(dir, 'package.json');
    const packageJsonUrl = pathToFileURL(packagePath);

    try {
      const specs = [
        {
          name: 'dashboard',
          defaultHealthUrl: 'http://127.0.0.1:9601/health',
          packageJsonUrl,
        },
      ];

      await Bun.write(packagePath, JSON.stringify({ version: '0.1.0' }));
      const first = await loadVersionTargets(specs);

      await Bun.write(packagePath, JSON.stringify({ version: '0.1.1' }));
      const second = await loadVersionTargets(specs);

      expect(first[0]?.expectedVersion).toBe('0.1.0');
      expect(second[0]?.expectedVersion).toBe('0.1.1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('DEFAULT_VERSION_TARGET_SPECS', () => {
  test('pin every default health URL to the canonical service registry', () => {
    const byName = Object.fromEntries(
      DEFAULT_VERSION_TARGET_SPECS.map((spec) => [spec.name, spec.defaultHealthUrl]),
    );
    expect(byName).toEqual({
      supervisor: `${SERVICES.supervisor.baseUrl}${SERVICES.supervisor.healthPath}`,
      gateway: `${SERVICES.gateway.baseUrl}${SERVICES.gateway.healthPath}`,
      trader: `${SERVICES.trader.baseUrl}${SERVICES.trader.healthPath}`,
      news: `${SERVICES.news.baseUrl}${SERVICES.news.healthPath}`,
      dashboard: `${SERVICES.dashboard.baseUrl}${SERVICES.dashboard.healthPath}`,
    });
  });

  test('dashboard self-target lands on the registry default port (9204)', () => {
    const dashboard = DEFAULT_VERSION_TARGET_SPECS.find((s) => s.name === 'dashboard');
    expect(dashboard).toBeDefined();
    expect(SERVICES.dashboard.port).toBe(9204);
    expect(dashboard?.defaultHealthUrl).toBe('http://127.0.0.1:9204/health');
  });

  test('loadVersionTargets honours dashboardPort override but defaults to registry', async () => {
    const dashboardSpec = DEFAULT_VERSION_TARGET_SPECS.find((s) => s.name === 'dashboard');
    if (!dashboardSpec) throw new Error('dashboard spec missing');

    const defaults = await loadVersionTargets([dashboardSpec], {
      readPackageVersion: async () => '0.0.0',
    });
    expect(defaults[0]?.healthUrl).toBe(
      `${SERVICES.dashboard.baseUrl}${SERVICES.dashboard.healthPath}`,
    );

    const overridden = await loadVersionTargets([dashboardSpec], {
      dashboardPort: 19204,
      readPackageVersion: async () => '0.0.0',
    });
    expect(overridden[0]?.healthUrl).toBe('http://127.0.0.1:19204/health');
  });
});

describe('probeVersionMatrix', () => {
  test('aborts wedged health probes and fails the row closed', async () => {
    const target: VersionTarget = {
      name: 'gateway',
      healthUrl: 'http://127.0.0.1:9201/health',
      expectedVersion: '0.3.1',
    };
    let sawAbort = false;
    const fetcher: VersionMatrixFetcher = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => {
            sawAbort = true;
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          },
          { once: true },
        );
      });

    const snapshot = await probeVersionMatrix({ targets: [target], fetcher, timeoutMs: 5 });

    expect(sawAbort).toBe(true);
    expect(snapshot.rows[0]).toMatchObject({
      name: 'gateway',
      state: 'unreachable',
      error: 'timeout after 5ms',
    });
  });
});

function result(
  name: string,
  runningVersion: string,
  expectedVersion: string,
  status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy',
): VersionProbeResult {
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
      status,
      started_at: CHECKED_AT,
      uptime_seconds: 1,
      pid: 123,
      details: {},
      checked_at: CHECKED_AT,
    },
  };
}
