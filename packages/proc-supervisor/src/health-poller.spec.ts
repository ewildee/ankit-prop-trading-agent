import { describe, expect, test } from 'bun:test';
import { type HealthFetcher, pollOnce, waitUntilHealthy } from './health-poller.ts';
import { HealthCfg } from './types.ts';

const okBody = (status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'): unknown => ({
  service: 'fake',
  version: '0.0.1',
  bun_version: '1.3.13',
  status,
  started_at: '2026-04-27T16:00:00+02:00',
  uptime_seconds: 1,
  pid: 1,
  details: {},
  checked_at: '2026-04-27T16:00:01+02:00',
});

function fixedFetcher(body: unknown, init: ResponseInit = { status: 200 }): HealthFetcher {
  return {
    fetch: async () =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json' },
      }),
  };
}

const cfg = HealthCfg.parse({ url: 'http://x/health', timeoutMs: 500, startupPollIntervalMs: 10 });

describe('pollOnce', () => {
  test('returns ok on healthy snapshot', async () => {
    const r = await pollOnce(cfg, fixedFetcher(okBody()));
    expect(r.ok).toBe(true);
  });

  test('returns not-ok on HTTP 5xx', async () => {
    const r = await pollOnce(cfg, fixedFetcher('boom', { status: 500 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/HTTP 500/);
  });

  test('returns not-ok on invalid JSON', async () => {
    const r = await pollOnce(cfg, fixedFetcher('not json', { status: 200 }));
    expect(r.ok).toBe(false);
  });

  test('rejects status=unhealthy when expectStatus=healthy', async () => {
    const r = await pollOnce(cfg, fixedFetcher(okBody('unhealthy')));
    expect(r.ok).toBe(false);
  });
});

describe('waitUntilHealthy', () => {
  test('retries until success', async () => {
    let attempts = 0;
    const fetcher: HealthFetcher = {
      fetch: async () => {
        attempts += 1;
        if (attempts < 3) return new Response('not yet', { status: 503 });
        return new Response(JSON.stringify(okBody()), { status: 200 });
      },
    };
    const r = await waitUntilHealthy(cfg, {
      deadline: Date.now() + 1_000,
      fetcher,
      sleep: () => Promise.resolve(),
    });
    expect(r.ok).toBe(true);
    expect(attempts).toBe(3);
  });

  test('gives up at deadline', async () => {
    const fetcher: HealthFetcher = {
      fetch: async () => new Response('x', { status: 503 }),
    };
    const r = await waitUntilHealthy(cfg, {
      deadline: Date.now() + 50,
      fetcher,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    });
    expect(r.ok).toBe(false);
  });
});
