import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServiceCfg, SupervisorCfg } from '../src/types.ts';

export const TEST_DIR = dirname(fileURLToPath(import.meta.url));
export const FAKE_SERVICE = resolve(TEST_DIR, 'fake-service.ts');

let nextPort = 19_100 + Math.floor(Math.random() * 5_000);
export function freshPort(): number {
  nextPort += 1;
  return nextPort;
}

export function fakeServiceCfg(
  overrides: Partial<ServiceCfg> & { port: number; name: string },
): ServiceCfg {
  const env: Record<string, string> = {
    FAKE_SERVICE_NAME: overrides.name,
    FAKE_SERVICE_PORT: String(overrides.port),
    ...(overrides.env ?? {}),
  };
  return {
    name: overrides.name,
    cmd: `bun run ${FAKE_SERVICE}`,
    port: overrides.port,
    onExisting: overrides.onExisting ?? 'refuse',
    env,
    health: {
      url: `http://127.0.0.1:${overrides.port}/health`,
      timeoutMs: 8_000,
      runningPollIntervalMs: 200,
      startupPollIntervalMs: 100,
      expectStatus: 'healthy',
      ...(overrides.health ?? {}),
    },
    restart: {
      policy: 'on-failure',
      maxCrashes: 3,
      windowMs: 60_000,
      baseDelayMs: 50,
      maxDelayMs: 1_000,
      ...(overrides.restart ?? {}),
    },
    shutdown: {
      timeoutMs: 3_000,
      signal: 'SIGTERM',
      ...(overrides.shutdown ?? {}),
    },
    dependsOn: overrides.dependsOn ?? [],
  };
}

export function makeCfg(services: ServiceCfg[], port = freshPort()): SupervisorCfg {
  return { mode: 'dev', port, services };
}

export async function poll<T>(
  fn: () => Promise<T> | T,
  predicate: (v: T) => boolean,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const intervalMs = opts.intervalMs ?? 50;
  const deadline = Date.now() + timeoutMs;
  let last: T;
  while (true) {
    last = await fn();
    if (predicate(last)) return last;
    if (Date.now() >= deadline) {
      throw new Error(`poll: timed out after ${timeoutMs}ms; last value=${JSON.stringify(last)}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export async function isPortListening(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(500),
    });
    return res.ok;
  } catch {
    return false;
  }
}
