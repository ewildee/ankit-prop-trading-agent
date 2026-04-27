import { HealthSnapshot } from '@ankit-prop/contracts';
import type { HealthCfg } from './types.ts';

export type HealthResult =
  | { ok: true; snapshot: HealthSnapshot }
  | { ok: false; error: string; httpStatus?: number };

export interface HealthFetcher {
  fetch: (url: string, init: { signal: AbortSignal }) => Promise<Response>;
}

export const realHealthFetcher: HealthFetcher = {
  fetch: (url, init) => fetch(url, init),
};

export async function pollOnce(
  cfg: HealthCfg,
  fetcher: HealthFetcher = realHealthFetcher,
): Promise<HealthResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort();
  }, cfg.timeoutMs);
  try {
    const res = await fetcher.fetch(cfg.url, { signal: ctrl.signal });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, httpStatus: res.status };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      return { ok: false, error: `invalid JSON: ${(err as Error).message}` };
    }
    const parsed = HealthSnapshot.safeParse(body);
    if (!parsed.success) {
      return { ok: false, error: `invalid schema: ${parsed.error.message}` };
    }
    if (cfg.expectStatus === 'healthy' && parsed.data.status !== 'healthy') {
      return { ok: false, error: `status=${parsed.data.status}` };
    }
    if (cfg.expectStatus === 'degraded' && parsed.data.status === 'unhealthy') {
      return { ok: false, error: `status=${parsed.data.status}` };
    }
    return { ok: true, snapshot: parsed.data };
  } catch (err) {
    const e = err as Error;
    if (e.name === 'AbortError') {
      return { ok: false, error: `timeout after ${cfg.timeoutMs}ms` };
    }
    return { ok: false, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function waitUntilHealthy(
  cfg: HealthCfg,
  opts: {
    deadline: number;
    fetcher?: HealthFetcher;
    sleep?: (ms: number) => Promise<void>;
    onAttempt?: (r: HealthResult, attempt: number) => void;
  },
): Promise<HealthResult> {
  const fetcher = opts.fetcher ?? realHealthFetcher;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let attempt = 0;
  while (Date.now() < opts.deadline) {
    attempt += 1;
    const r = await pollOnce(cfg, fetcher);
    opts.onAttempt?.(r, attempt);
    if (r.ok) return r;
    const remaining = opts.deadline - Date.now();
    if (remaining <= 0) return r;
    await sleep(Math.min(cfg.startupPollIntervalMs, remaining));
  }
  return { ok: false, error: `deadline exceeded` };
}
