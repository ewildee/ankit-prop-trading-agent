import { join } from 'node:path';
import { createPinoLogger, loadVersionFromPkgJson, SERVICES } from '@ankit-prop/contracts';
import pkgJson from '../package.json' with { type: 'json' };
import { buildNewsApp } from './app.ts';
import { type CalendarDb, openCalendarDb } from './db/calendar-db.ts';
import { type CalendarFetcher, createCalendarFetcher } from './fetcher/index.ts';
import { createFreshnessMonitor } from './freshness/index.ts';
import { NewsMetrics } from './metrics.ts';
import { loadSymbolTagMap } from './symbol-tag-mapper.ts';

type BunServer = ReturnType<typeof Bun.serve>;

export interface NewsRuntime {
  readonly server: BunServer;
  readonly fetcher: CalendarFetcher;
  readonly db: CalendarDb;
}

const SERVICE_VERSION = loadVersionFromPkgJson(pkgJson);
const logger = createPinoLogger({
  service: 'news',
  pretty: Bun.env.NODE_ENV !== 'production',
});

export function startNewsRuntimeFromEnv(): NewsRuntime {
  const db = openCalendarDb({
    path: Bun.env.NEWS_CALENDAR_DB_PATH ?? join(import.meta.dir, '..', 'data', 'calendar.db'),
    clock: { now: () => new Date() },
  });
  const symbolTagMapPath = Bun.env.SYMBOL_TAG_MAP_CONFIG;
  const mapper =
    symbolTagMapPath === undefined ? loadSymbolTagMap() : loadSymbolTagMap(symbolTagMapPath);
  const freshness = createFreshnessMonitor({ db });
  const fetcher = createCalendarFetcher({ db, logger });
  const metrics = new NewsMetrics({ freshness });
  const symbolLogger = {
    warn(message: string, context?: Record<string, unknown>) {
      logger.warn(context ?? {}, message);
    },
  };
  const app = buildNewsApp({
    db,
    freshness,
    mapper,
    metrics,
    logger: symbolLogger,
    version: SERVICE_VERSION,
    startedAtMs: Date.now(),
  });
  const port = parsePort(Bun.env.PORT ?? String(SERVICES.news.port));
  const server = app.listen(port);
  if (!server.server) {
    throw new Error('news service failed to start');
  }
  fetcher.start();
  logger.info(
    { port, version: SERVICE_VERSION },
    `news listening port=${port} version=${SERVICE_VERSION}`,
  );
  return { server: server.server, fetcher, db };
}

export async function stopNewsRuntime(runtime: NewsRuntime): Promise<void> {
  runtime.fetcher.stop();
  runtime.db.close();
  await runtime.server.stop(true);
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`invalid PORT: ${value}`);
  }
  return port;
}

if (import.meta.main) {
  let runtime: NewsRuntime;
  try {
    runtime = startNewsRuntimeFromEnv();
  } catch (error) {
    logger.error({ error }, 'news startup failed');
    process.exit(1);
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void stopNewsRuntime(runtime)
        .catch((error: unknown) => {
          logger.error({ error }, 'news shutdown failed');
        })
        .finally(() => process.exit(0));
    });
  }
}
