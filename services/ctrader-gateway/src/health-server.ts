// BLUEPRINT §19.1 — `ctrader-gateway` Elysia /health endpoint on port 9201.

import { Elysia } from 'elysia';
import { buildHealthSnapshot, type HealthDeps } from './health-snapshot.ts';

type BunServer = ReturnType<typeof Bun.serve>;

export type { DependencyState, HealthDeps } from './health-snapshot.ts';
export { buildHealthSnapshot } from './health-snapshot.ts';

export interface HealthServerOptions extends HealthDeps {
  readonly port?: number;
}

export function buildHealthApp(deps: HealthDeps) {
  return new Elysia().get('/health', ({ set }) => {
    const snap = buildHealthSnapshot(deps);
    if (snap.status === 'unhealthy') set.status = 503;
    return snap;
  });
}

export type HealthApp = ReturnType<typeof buildHealthApp>;

export function startHealthServer(opts: HealthServerOptions): BunServer {
  const app = buildHealthApp(opts).listen(opts.port ?? 9201);
  if (!app.server) throw new Error('ctrader-gateway health server failed to start');
  return app.server;
}
