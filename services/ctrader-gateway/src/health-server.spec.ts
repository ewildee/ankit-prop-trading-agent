import { describe, expect, test } from 'bun:test';
import { HealthSnapshot } from '@ankit-prop/contracts';
import { buildHealthApp } from './health-server.ts';

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
