import type { AggregatedHealth, HealthStatus } from '@ankit-prop/contracts';

type BunServer = ReturnType<typeof Bun.serve>;

import type { ProcessManager } from './process-manager.ts';
import type { SupervisorCfg } from './types.ts';

export interface AggregatedHealthDeps {
  managers: () => readonly ProcessManager[];
  cfg: SupervisorCfg;
  supervisorVersion: string;
  startedAt: number;
  now?: () => number;
  onShutdownRequested?: () => void;
}

export function buildAggregatedHealth(deps: AggregatedHealthDeps): AggregatedHealth {
  const now = (deps.now ?? Date.now)();
  const services = deps.managers().map((m) => m.getStatus());

  let status: HealthStatus = 'healthy';
  for (const s of services) {
    if (s.state === 'circuit-broken' || s.state === 'crashed') {
      status = 'unhealthy';
      break;
    }
    if (s.state === 'unhealthy' || s.state === 'starting' || s.state === 'stopping') {
      status = 'degraded';
    }
  }

  return {
    service: 'proc-supervisor',
    version: deps.supervisorVersion,
    bun_version: Bun.version,
    status,
    started_at: new Date(deps.startedAt).toISOString(),
    uptime_seconds: Math.max(0, Math.floor((now - deps.startedAt) / 1000)),
    pid: process.pid,
    checked_at: new Date(now).toISOString(),
    mode: deps.cfg.mode,
    services,
  };
}

export function startAggregatedHealthServer(deps: AggregatedHealthDeps): BunServer {
  return Bun.serve({
    port: deps.cfg.port,
    async fetch(req): Promise<Response> {
      const url = new URL(req.url);
      if (req.method === 'GET' && url.pathname === '/health') {
        const snap = buildAggregatedHealth(deps);
        return Response.json(snap, {
          status: snap.status === 'unhealthy' ? 503 : 200,
        });
      }
      if (req.method === 'GET' && url.pathname === '/services') {
        return Response.json(deps.managers().map((m) => m.getStatus()));
      }
      if (req.method === 'DELETE' && url.pathname === '/supervisor') {
        deps.onShutdownRequested?.();
        return Response.json({ ok: true });
      }
      const restartMatch = url.pathname.match(/^\/services\/([^/]+)\/restart$/);
      if (req.method === 'POST' && restartMatch) {
        const name = decodeURIComponent(restartMatch[1] ?? '');
        const m = deps.managers().find((x) => x.cfg.name === name);
        if (!m) return Response.json({ error: `unknown service: ${name}` }, { status: 404 });
        try {
          await m.restart();
          return Response.json({ ok: true, service: name, status: m.getStatus() });
        } catch (err) {
          return Response.json(
            { ok: false, service: name, error: (err as Error).message },
            { status: 500 },
          );
        }
      }
      const logsMatch = url.pathname.match(/^\/services\/([^/]+)\/logs$/);
      if (req.method === 'GET' && logsMatch) {
        const name = decodeURIComponent(logsMatch[1] ?? '');
        const m = deps.managers().find((x) => x.cfg.name === name);
        if (!m) return new Response(`unknown service: ${name}`, { status: 404 });
        return new Response(m.recentLogs().join('\n'), {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      return new Response('not found', { status: 404 });
    },
  });
}
