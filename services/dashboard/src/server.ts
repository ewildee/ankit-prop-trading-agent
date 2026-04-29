import { join } from 'node:path';
import { HealthSnapshot, loadVersionFromPkgJson, SERVICES } from '@ankit-prop/contracts';
import pkgJson from '../package.json' with { type: 'json' };
import { buildDashboardAssets, DASHBOARD_DIST_DIR } from './build.ts';
import { buildDashboardHealthSnapshot } from './health-server.ts';
import {
  DEFAULT_VERSION_TARGET_SPECS,
  loadDefaultVersionTargets,
  probeVersionMatrix,
} from './version-matrix.ts';

type BunServer = ReturnType<typeof Bun.serve>;

const SERVICE_VERSION = loadVersionFromPkgJson(pkgJson);
const DEFAULT_PORT = SERVICES.dashboard.port;

export interface DashboardServerOptions {
  readonly port?: number;
  readonly startedAtMs?: number;
  readonly staticDir?: string;
  readonly buildAssets?: boolean;
}

export async function startDashboardServer(opts: DashboardServerOptions = {}): Promise<BunServer> {
  const staticDir = opts.staticDir ?? DASHBOARD_DIST_DIR;
  if (opts.buildAssets ?? true) {
    await buildDashboardAssets(staticDir);
  }

  const startedAtMs = opts.startedAtMs ?? Date.now();
  const port = opts.port ?? Number(Bun.env.DASHBOARD_PORT ?? DEFAULT_PORT);
  return Bun.serve({
    port,
    async fetch(req): Promise<Response> {
      const url = new URL(req.url);

      if (req.method === 'GET' && url.pathname === '/health') {
        const snapshot = buildDashboardHealthSnapshot({
          version: SERVICE_VERSION,
          startedAtMs,
          versionTargets: DEFAULT_VERSION_TARGET_SPECS.length,
        });
        return Response.json(HealthSnapshot.parse(snapshot));
      }

      if (req.method === 'GET' && url.pathname === '/api/version-matrix') {
        const targets = await loadDefaultVersionTargets({ dashboardPort: port });
        return Response.json(await probeVersionMatrix({ targets }));
      }

      if (req.method === 'GET' && url.pathname === '/') {
        return htmlResponse();
      }

      if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
        return serveAsset(staticDir, url.pathname.slice('/assets/'.length));
      }

      return new Response('not found', { status: 404 });
    },
  });
}

function htmlResponse(): Response {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ankit Prop Trader Dashboard</title>
    <link rel="stylesheet" href="/assets/main.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/main.js"></script>
  </body>
</html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

async function serveAsset(staticDir: string, assetName: string): Promise<Response> {
  if (assetName.includes('..') || assetName.includes('/')) {
    return new Response('not found', { status: 404 });
  }
  const file = Bun.file(join(staticDir, assetName));
  if (!(await file.exists())) return new Response('not found', { status: 404 });
  return new Response(file, {
    headers: {
      'cache-control': 'no-store',
      'content-type': assetName.endsWith('.css')
        ? 'text/css; charset=utf-8'
        : 'application/javascript; charset=utf-8',
    },
  });
}
