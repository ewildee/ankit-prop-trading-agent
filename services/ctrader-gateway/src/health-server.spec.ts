import { describe, expect, test } from 'bun:test';
import { HealthSnapshot } from '@ankit-prop/contracts';
import { buildHealthApp, startHealthServer } from './health-server.ts';

const FROZEN_START = Date.UTC(2026, 3, 27, 12, 0, 0);
const FROZEN_NOW = FROZEN_START + 5_000;

describe('buildHealthApp', () => {
  test('GET /health returns 200 with HealthSnapshot when status is degraded', async () => {
    const app = buildHealthApp({
      version: '0.1.0',
      startedAtMs: FROZEN_START,
      now: () => FROZEN_NOW,
    });
    const res = await app.handle(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown;
    expect(() => HealthSnapshot.parse(body)).not.toThrow();
    const snap = HealthSnapshot.parse(body);
    expect(snap.service).toBe('ctrader-gateway');
    expect(snap.status).toBe('degraded');
  });

  test('GET /health returns 503 when status is unhealthy', async () => {
    const app = buildHealthApp({
      version: '0.1.0',
      startedAtMs: FROZEN_START,
      now: () => FROZEN_NOW,
      transport: () => 'unhealthy',
    });
    const res = await app.handle(new Request('http://localhost/health'));
    expect(res.status).toBe(503);
    const body = (await res.json()) as unknown;
    const snap = HealthSnapshot.parse(body);
    expect(snap.status).toBe('unhealthy');
  });

  test('unknown path returns 404', async () => {
    const app = buildHealthApp({
      version: '0.1.0',
      startedAtMs: FROZEN_START,
      now: () => FROZEN_NOW,
    });
    const res = await app.handle(new Request('http://localhost/orders'));
    expect(res.status).toBe(404);
  });
});

describe('startHealthServer', () => {
  test('listens on an ephemeral port and stops cleanly', async () => {
    const server = startHealthServer({
      port: 0,
      version: '0.1.0',
      startedAtMs: FROZEN_START,
      now: () => FROZEN_NOW,
      transport: () => 'connected',
      rails: () => 'ready',
    });
    const url = `http://127.0.0.1:${server.port}/health`;

    try {
      expect(server.port).toBeGreaterThan(0);
      const res = await fetch(url);
      expect(res.status).toBe(200);

      const snap = HealthSnapshot.parse(await res.json());
      expect(snap.version).toBe('0.1.0');
      expect(snap.details.transport).toBe('connected');
      expect(snap.details.rails).toBe('ready');
      expect(snap.checked_at).toBe(new Date(FROZEN_NOW).toISOString());
      expect(snap.status).toBe('healthy');
    } finally {
      await expect(server.stop(true)).resolves.toBeUndefined();
    }

    await expect(fetch(url, { signal: AbortSignal.timeout(250) })).rejects.toThrow();
  });
});
