// Entry point for `bun run --cwd services/ctrader-gateway start`. Phase 2.3
// only spins up the §19.1 /health endpoint so the supervisor can poll us;
// transport / OAuth / order-manager wiring lands in ANKA-13 / ANKA-15.

import { loadVersionFromPkgJson } from '@ankit-prop/contracts';
import pkgJson from '../package.json' with { type: 'json' };
import { startHealthServer } from './health-server.ts';

const startedAtMs = Date.now();
const version = loadVersionFromPkgJson(pkgJson);
const port = Number(process.env['CTRADER_GATEWAY_PORT'] ?? 9201);

const server = startHealthServer({ port, version, startedAtMs });

// Single structured log line so supervisor / log-tail can spot a clean boot.
console.log(
  JSON.stringify({
    service: 'ctrader-gateway',
    event: 'health_server_started',
    port: server.port,
    version,
    pid: process.pid,
    blueprint_section: '19.1',
  }),
);

const shutdown = async (signal: string): Promise<void> => {
  console.log(JSON.stringify({ service: 'ctrader-gateway', event: 'shutdown', signal }));
  await server.stop(true);
  process.exit(0);
};

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
