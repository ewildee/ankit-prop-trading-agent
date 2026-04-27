// fake-service.ts — Bun module entrypoint (top-level await OK).
export {};

// Tiny fake managed service: serves /health (HealthSnapshot shape).
// Driven by env vars so integration tests can shape its behaviour.
//
//   FAKE_SERVICE_NAME       — service name in HealthSnapshot                (default: 'fake')
//   FAKE_SERVICE_PORT       — bind port                                     (required)
//   FAKE_SERVICE_VERSION    — version field                                 (default: '0.0.1-fake')
//   FAKE_SERVICE_STATUS     — 'healthy' | 'degraded' | 'unhealthy'         (default: 'healthy')
//   FAKE_SERVICE_BOOT_DELAY_MS — delay before first /health response        (default: 0)
//   FAKE_SERVICE_EXIT_AFTER_MS — process.exit(code) after this many ms      (default: never)
//   FAKE_SERVICE_EXIT_CODE  — exit code for FAKE_SERVICE_EXIT_AFTER_MS      (default: 1)
//   FAKE_SERVICE_IGNORE_SIGTERM — '1' to ignore SIGTERM                     (default: 0)

const env = Bun.env;
const serviceName = env.FAKE_SERVICE_NAME ?? 'fake';
const portRaw = env.FAKE_SERVICE_PORT;
if (!portRaw) {
  console.error('fake-service: FAKE_SERVICE_PORT is required');
  process.exit(2);
}
const port = Number.parseInt(portRaw, 10);
const version = env.FAKE_SERVICE_VERSION ?? '0.0.1-fake';
const healthStatus = (env.FAKE_SERVICE_STATUS ?? 'healthy') as 'healthy' | 'degraded' | 'unhealthy';
const bootDelay = Number.parseInt(env.FAKE_SERVICE_BOOT_DELAY_MS ?? '0', 10);
const exitAfter = env.FAKE_SERVICE_EXIT_AFTER_MS
  ? Number.parseInt(env.FAKE_SERVICE_EXIT_AFTER_MS, 10)
  : null;
const exitCode = Number.parseInt(env.FAKE_SERVICE_EXIT_CODE ?? '1', 10);
const ignoreTerm = env.FAKE_SERVICE_IGNORE_SIGTERM === '1';

if (ignoreTerm) {
  process.on('SIGTERM', () => {
    console.log(`[${serviceName}] SIGTERM ignored`);
  });
}
process.on('SIGINT', () => {
  console.log(`[${serviceName}] SIGINT received, exiting cleanly`);
  process.exit(0);
});

const startedAt = new Date().toISOString();
const startedAtMs = Date.now();

await new Promise<void>((r) => setTimeout(r, bootDelay));

const server = Bun.serve({
  port,
  hostname: '127.0.0.1',
  fetch(req): Response {
    const url = new URL(req.url);
    if (url.pathname === '/health') {
      return Response.json({
        service: serviceName,
        version,
        bun_version: Bun.version,
        status: healthStatus,
        started_at: startedAt,
        uptime_seconds: Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)),
        pid: process.pid,
        details: { fake: true },
        checked_at: new Date().toISOString(),
      });
    }
    return new Response('not found', { status: 404 });
  },
});

console.log(`[${serviceName}] listening on ${server.port}`);

if (exitAfter !== null) {
  setTimeout(() => {
    console.log(`[${serviceName}] exiting with code=${exitCode} after ${exitAfter}ms`);
    process.exit(exitCode);
  }, exitAfter);
}
