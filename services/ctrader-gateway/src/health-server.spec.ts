import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { HealthSnapshot } from '@ankit-prop/contracts';
import { buildHealthSnapshot, startHealthServer } from './health-server.ts';

const FROZEN_START = Date.UTC(2026, 3, 27, 12, 0, 0);
const FROZEN_NOW = FROZEN_START + 5_000;

describe('buildHealthSnapshot', () => {
  test('reports degraded while transport is not-connected (Phase 2.3 default)', () => {
    const snap = buildHealthSnapshot({
      version: '0.1.0',
      startedAtMs: FROZEN_START,
      now: () => FROZEN_NOW,
    });
    expect(snap.service).toBe('ctrader-gateway');
    expect(snap.status).toBe('degraded');
    expect(snap.uptime_seconds).toBe(5);
    expect(snap.details['transport']).toBe('not-connected');
    expect(snap.details['rails']).toBe('ready');
    expect(() => HealthSnapshot.parse(snap)).not.toThrow();
  });

  test('reports healthy once transport reports connected', () => {
    const snap = buildHealthSnapshot({
      version: '0.1.0',
      startedAtMs: FROZEN_START,
      now: () => FROZEN_NOW,
      transport: () => 'connected',
    });
    expect(snap.status).toBe('healthy');
    expect(snap.details['transport']).toBe('connected');
  });
});

describe('startHealthServer', () => {
  let server: ReturnType<typeof startHealthServer> | undefined;

  beforeEach(() => {
    server = undefined;
  });

  afterEach(async () => {
    if (server) await server.stop(true);
  });

  test('GET /health returns 200 with HealthSnapshot when status is degraded', async () => {
    server = startHealthServer({
      port: 0, // ephemeral
      version: '0.1.0',
      startedAtMs: FROZEN_START,
      now: () => FROZEN_NOW,
    });
    const res = await fetch(`http://localhost:${server.port}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown;
    expect(() => HealthSnapshot.parse(body)).not.toThrow();
    const snap = HealthSnapshot.parse(body);
    expect(snap.service).toBe('ctrader-gateway');
    expect(snap.status).toBe('degraded');
  });

  test('unknown path returns 404', async () => {
    server = startHealthServer({
      port: 0,
      version: '0.1.0',
      startedAtMs: FROZEN_START,
      now: () => FROZEN_NOW,
    });
    const res = await fetch(`http://localhost:${server.port}/orders`);
    expect(res.status).toBe(404);
  });
});
