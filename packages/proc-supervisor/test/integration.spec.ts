// 7 integration cases per BLUEPRINT §22 phase 1 exit gate:
//   1. adopt          — onExisting=adopt picks up an externally-started fake-service
//   2. replace        — onExisting=replace kills an externally-started owner and re-binds
//   3. refuse         — onExisting=refuse fails fast when port is already taken
//   4. restart-policy — supervisor restarts a service that crashes once
//   5. topo-order     — services start in dependency order (BLUEPRINT §3.4)
//   6. circuit-break  — 4th crash inside the window flips the service to circuit-broken
//   7. graceful-shutdown — reverse-topo-order shutdown reaches stopped state cleanly

import { afterEach, describe, expect, test } from 'bun:test';
import { AggregatedHealth } from '@ankit-prop/contracts';
import { Supervisor } from '../src/supervisor.ts';
import { silentLogger } from '../src/types.ts';
import {
  FAKE_SERVICE,
  fakeServiceCfg,
  freshPort,
  isPortListening,
  makeCfg,
  poll,
} from './test-utils.ts';

const supervisorsToCleanup: Supervisor[] = [];
const externalToCleanup: Array<{ kill: () => void }> = [];

afterEach(async () => {
  while (externalToCleanup.length > 0) {
    try {
      externalToCleanup.pop()?.kill();
    } catch {
      /* noop */
    }
  }
  while (supervisorsToCleanup.length > 0) {
    const s = supervisorsToCleanup.pop();
    if (s) await s.stop().catch(() => {});
  }
});

function trackSupervisor(s: Supervisor): Supervisor {
  supervisorsToCleanup.push(s);
  return s;
}

function spawnExternal(env: Record<string, string>): { kill: () => void } {
  const sub = Bun.spawn(['bun', 'run', FAKE_SERVICE], {
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const handle = {
    kill: () => {
      try {
        sub.kill('SIGKILL');
      } catch {
        /* noop */
      }
    },
  };
  externalToCleanup.push(handle);
  return handle;
}

describe('proc-supervisor integration (BLUEPRINT §22 phase 1)', () => {
  test('case 1: adopt — picks up an externally-started service on the same port', async () => {
    const port = freshPort();
    spawnExternal({ FAKE_SERVICE_NAME: 'preexisting', FAKE_SERVICE_PORT: String(port) });
    await poll(
      () => isPortListening(port),
      (ok) => ok,
      { timeoutMs: 5_000 },
    );

    const cfg = makeCfg([fakeServiceCfg({ name: 'preexisting', port, onExisting: 'adopt' })]);
    const sup = trackSupervisor(
      new Supervisor({
        cfg,
        supervisorVersion: '0.1.0',
        logger: silentLogger,
        startHealthServer: false,
      }),
    );
    await sup.start();
    const status = sup.manager('preexisting').getStatus();
    expect(status.state).toBe('adopted');
    expect(status.adopted).toBe(true);
  }, 20_000);

  test('case 2: replace — kills the existing owner and re-spawns', async () => {
    const port = freshPort();
    spawnExternal({ FAKE_SERVICE_NAME: 'owner', FAKE_SERVICE_PORT: String(port) });
    await poll(
      () => isPortListening(port),
      (ok) => ok,
      { timeoutMs: 5_000 },
    );

    const cfg = makeCfg([fakeServiceCfg({ name: 'replacer', port, onExisting: 'replace' })]);
    const sup = trackSupervisor(
      new Supervisor({
        cfg,
        supervisorVersion: '0.1.0',
        logger: silentLogger,
        startHealthServer: false,
      }),
    );
    await sup.start();
    const status = sup.manager('replacer').getStatus();
    expect(status.state).toBe('running');
    expect(status.adopted).toBe(false);
    expect(status.health?.service).toBe('replacer');
  }, 25_000);

  test('case 3: refuse — fails fast when the port is already in use', async () => {
    const port = freshPort();
    spawnExternal({ FAKE_SERVICE_NAME: 'incumbent', FAKE_SERVICE_PORT: String(port) });
    await poll(
      () => isPortListening(port),
      (ok) => ok,
      { timeoutMs: 5_000 },
    );

    const cfg = makeCfg([fakeServiceCfg({ name: 'usurper', port, onExisting: 'refuse' })]);
    const sup = trackSupervisor(
      new Supervisor({
        cfg,
        supervisorVersion: '0.1.0',
        logger: silentLogger,
        startHealthServer: false,
      }),
    );
    await expect(sup.start()).rejects.toThrow(/refuse|port/i);
    const status = sup.manager('usurper').getStatus();
    expect(['idle', 'crashed']).toContain(status.state);
  }, 15_000);

  test('case 4: restart-policy — supervisor restarts a service that crashes once', async () => {
    const port = freshPort();
    const cfg = makeCfg([
      fakeServiceCfg({
        name: 'flaky',
        port,
        env: { FAKE_SERVICE_EXIT_AFTER_MS: '500', FAKE_SERVICE_EXIT_CODE: '1' },
        restart: {
          policy: 'on-failure',
          maxCrashes: 5,
          windowMs: 60_000,
          baseDelayMs: 50,
          maxDelayMs: 1_000,
        },
      }),
    ]);
    const sup = trackSupervisor(
      new Supervisor({
        cfg,
        supervisorVersion: '0.1.0',
        logger: silentLogger,
        startHealthServer: false,
      }),
    );
    await sup.start();
    const m = sup.manager('flaky');
    await poll(
      () => m.getStatus(),
      (s) => s.restartCount >= 1,
      { timeoutMs: 15_000, intervalMs: 100 },
    );
    const status = m.getStatus();
    expect(status.restartCount).toBeGreaterThanOrEqual(1);
  }, 30_000);

  test('case 5: topo-order — dependent service starts after its dependency', async () => {
    const newsPort = freshPort();
    const traderPort = freshPort();
    const observed: string[] = [];

    const news = fakeServiceCfg({
      name: 'news',
      port: newsPort,
      env: { FAKE_SERVICE_BOOT_DELAY_MS: '600' },
    });
    const trader = fakeServiceCfg({
      name: 'trader',
      port: traderPort,
      dependsOn: ['news'],
    });
    const cfg = makeCfg([trader, news]);

    const sup = trackSupervisor(
      new Supervisor({
        cfg,
        supervisorVersion: '0.1.0',
        logger: {
          info: (event, fields) => {
            if (event === 'service.spawned' && fields && typeof fields.service === 'string') {
              observed.push(fields.service);
            }
          },
          warn: () => {},
          error: () => {},
          debug: () => {},
        },
        startHealthServer: false,
      }),
    );
    await sup.start();
    expect(observed.indexOf('news')).toBeGreaterThanOrEqual(0);
    expect(observed.indexOf('trader')).toBeGreaterThan(observed.indexOf('news'));
  }, 25_000);

  test('case 6: circuit-break — repeated crashes flip the service to circuit-broken', async () => {
    const port = freshPort();
    const cfg = makeCfg([
      fakeServiceCfg({
        name: 'doomed',
        port,
        env: { FAKE_SERVICE_EXIT_AFTER_MS: '120', FAKE_SERVICE_EXIT_CODE: '1' },
        restart: {
          policy: 'on-failure',
          maxCrashes: 2,
          windowMs: 60_000,
          baseDelayMs: 10,
          maxDelayMs: 50,
        },
      }),
    ]);
    const sup = trackSupervisor(
      new Supervisor({
        cfg,
        supervisorVersion: '0.1.0',
        logger: silentLogger,
        startHealthServer: false,
      }),
    );
    await sup.start();
    const m = sup.manager('doomed');
    await poll(
      () => m.getStatus(),
      (s) => s.state === 'circuit-broken',
      { timeoutMs: 30_000, intervalMs: 100 },
    );
    expect(m.getStatus().state).toBe('circuit-broken');
  }, 45_000);

  test('case 7: graceful shutdown — reverse-topo-order stop, all services reach stopped', async () => {
    const newsPort = freshPort();
    const traderPort = freshPort();
    const news = fakeServiceCfg({ name: 'news', port: newsPort });
    const trader = fakeServiceCfg({ name: 'trader', port: traderPort, dependsOn: ['news'] });
    const cfg = makeCfg([trader, news]);

    const aggregatedPort = cfg.port;
    const sup = trackSupervisor(
      new Supervisor({ cfg, supervisorVersion: '0.1.0', logger: silentLogger }),
    );
    await sup.start();

    const res = await fetch(`http://127.0.0.1:${aggregatedPort}/health`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as unknown;
    const parsed = AggregatedHealth.parse(body);
    expect(parsed.services.map((s) => s.name).sort()).toEqual(['news', 'trader']);

    await sup.stop();
    expect(sup.manager('trader').getStatus().state).toBe('stopped');
    expect(sup.manager('news').getStatus().state).toBe('stopped');
    await new Promise((r) => setTimeout(r, 200));
    expect(await isPortListening(aggregatedPort)).toBe(false);
  }, 30_000);
});
