import { startDashboardServer } from './server.ts';

const server = await startDashboardServer();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await server.stop(true);
    process.exit(0);
  });
}
