// BLUEPRINT §19.1 — `ctrader-gateway` /health endpoint on port 9201.
//
// Phase 2.3 ships only the rails subsystem; transport / OAuth / order
// manager land in ANKA-13 / ANKA-15. Until then the service deliberately
// reports `status: 'degraded'` — every dependency the rails will eventually
// observe is listed in `details` so the supervisor (and operators) get a
// complete picture without false-green readings (BLUEPRINT §3.5
// fail-closed).

import type { HealthSnapshot, HealthStatus } from '@ankit-prop/contracts';

type BunServer = ReturnType<typeof Bun.serve>;

export type DependencyState = 'connected' | 'not-connected' | 'ready' | 'pending';

export interface HealthDeps {
  readonly version: string;
  readonly startedAtMs: number;
  readonly transport?: () => DependencyState;
  readonly rails?: () => DependencyState;
  readonly now?: () => number;
}

export function buildHealthSnapshot(deps: HealthDeps): HealthSnapshot {
  const now = (deps.now ?? Date.now)();
  const transport = deps.transport ? deps.transport() : 'not-connected';
  const rails = deps.rails ? deps.rails() : 'ready';

  // Status mapping: any dependency the rails consume that is `not-connected`
  // (transport) downgrades to `degraded`. `unhealthy` reserved for hard
  // failures (broker auth rejected, reconciliation drift detected) that ship
  // alongside ANKA-13 wiring.
  let status: HealthStatus = 'healthy';
  if (transport === 'not-connected' || transport === 'pending') status = 'degraded';

  return {
    service: 'ctrader-gateway',
    version: deps.version,
    bun_version: Bun.version,
    status,
    started_at: new Date(deps.startedAtMs).toISOString(),
    uptime_seconds: Math.max(0, Math.floor((now - deps.startedAtMs) / 1000)),
    pid: process.pid,
    details: { transport, rails, blueprint_section: '19.1' },
    checked_at: new Date(now).toISOString(),
  };
}

export interface HealthServerOptions extends HealthDeps {
  readonly port?: number;
}

export function startHealthServer(opts: HealthServerOptions): BunServer {
  return Bun.serve({
    port: opts.port ?? 9201,
    async fetch(req): Promise<Response> {
      const url = new URL(req.url);
      if (req.method === 'GET' && url.pathname === '/health') {
        const snap = buildHealthSnapshot(opts);
        return Response.json(snap, {
          status: snap.status === 'unhealthy' ? 503 : 200,
        });
      }
      return new Response('not found', { status: 404 });
    },
  });
}
