import { join } from 'node:path';

import { createPinoLogger, loadVersionFromPkgJson } from '@ankit-prop/contracts';
import { ConfigError, defineAppConfig, z } from '@triplon/config';
import pkgJson from '../package.json' with { type: 'json' };
import { closeCalendarDb, openCalendarDb } from './calendar-db.ts';
import { createFetcher, type FetcherLogger } from './fetcher.ts';
import { type FetcherHealth as ServerFetcherHealth, startServer } from './server.ts';

const DEFAULT_PORT = 9203;
const DEFAULT_FETCH_INTERVAL_MS = 30 * 60_000;
const DEFAULT_DATE_RANGE_DAYS = 14;
const DEFAULT_BASE_URL = 'https://gw2.ftmo.com/public-api/v1/economic-calendar';
const DEFAULT_DB_PATH = join(import.meta.dir, '..', '..', '..', 'data', 'calendar.db');

const NewsStartConfig = z.strictObject({
  port: z.coerce.number().int().min(0).max(65_535).default(DEFAULT_PORT),
  dbPath: z.string().min(1).default(DEFAULT_DB_PATH),
  fetchIntervalMs: z.coerce.number().int().positive().default(DEFAULT_FETCH_INTERVAL_MS),
  calendarBaseUrl: z.string().url().default(DEFAULT_BASE_URL),
  dateRangeDays: z.coerce.number().int().positive().default(DEFAULT_DATE_RANGE_DAYS),
});
type NewsStartConfig = z.infer<typeof NewsStartConfig>;

export interface StartOptions {
  readonly configPath?: string;
  readonly port?: number;
  readonly dbPath?: string;
  readonly fetch?: typeof fetch;
  readonly logger?: FetcherLogger;
  readonly installSignalHandlers?: boolean;
}

export interface NewsProcess {
  readonly port: number;
  stop(): Promise<void>;
}

export function loadNewsStartConfig(configPath?: string): NewsStartConfig {
  const handle = defineAppConfig({
    scope: 'ankit-prop',
    name: 'news',
    schema: NewsStartConfig,
  });

  if (configPath !== undefined) {
    handle.setConfigOverridePath(configPath);
    return handle.getConfig();
  }

  try {
    return handle.getConfig();
  } catch (err) {
    if (err instanceof ConfigError && err.code === 'E_CONFIG_NOT_FOUND') {
      return NewsStartConfig.parse({});
    }
    throw err;
  }
}

export async function start(opts: StartOptions = {}): Promise<NewsProcess> {
  const cfg = loadNewsStartConfig(opts.configPath);
  const version = loadVersionFromPkgJson(pkgJson);
  const startedAtMs = Date.now();
  const logger: FetcherLogger =
    opts.logger ??
    createPinoLogger({
      service: 'news',
      pretty: false,
      base: { version },
    });

  const db = openCalendarDb(opts.dbPath ?? cfg.dbPath);
  let dbOk = true;
  let stopPromise: Promise<void> | null = null;
  let signalCleanup: (() => void) | null = null;

  const fetcher = createFetcher({
    db,
    logger,
    intervalMs: cfg.fetchIntervalMs,
    baseUrl: cfg.calendarBaseUrl,
    dateRangeDays: cfg.dateRangeDays,
    ...(opts.fetch === undefined ? {} : { fetch: opts.fetch }),
  });

  void fetcher.start().catch((err) => {
    logger.error({ kind: 'news_fetcher_start_error', err: errorMessage(err) });
  });

  let server: ReturnType<typeof startServer>;
  try {
    server = startServer({
      db,
      fetcherHealth: (): ServerFetcherHealth => {
        const health = fetcher.getHealth();
        return {
          lastFetchAt:
            health.lastSuccessAt === null ? null : new Date(health.lastSuccessAt).toISOString(),
          ageSeconds: health.ageSeconds,
          dbOk,
        };
      },
      port: opts.port ?? cfg.port,
      logger,
      version,
      startedAtMs,
    });
  } catch (err) {
    fetcher.stop();
    dbOk = false;
    closeCalendarDb(db);
    throw err;
  }
  const boundPort = server.port;
  if (typeof boundPort !== 'number') {
    throw new Error('news start: Bun.serve did not expose a bound port');
  }

  const stop = async (): Promise<void> => {
    if (stopPromise !== null) {
      return stopPromise;
    }

    stopPromise = (async () => {
      signalCleanup?.();
      try {
        await server.stop(true);
      } finally {
        fetcher.stop();
        dbOk = false;
        closeCalendarDb(db);
      }
    })();
    return stopPromise;
  };

  const handle: NewsProcess = { port: boundPort, stop };

  if (opts.installSignalHandlers === true) {
    signalCleanup = installSignalHandlers(handle, logger);
  }

  logger.info?.({
    kind: 'news_started',
    port: boundPort,
    version,
    pid: process.pid,
    startedAt: new Date(startedAtMs).toISOString(),
  });

  return handle;
}

function installSignalHandlers(handle: NewsProcess, logger: FetcherLogger): () => void {
  const shutdown = (signal: NodeJS.Signals): void => {
    void handle
      .stop()
      .then(() => {
        logger.info?.({ kind: 'news_shutdown', signal });
        process.exit(0);
      })
      .catch((err) => {
        logger.error({ kind: 'news_shutdown_error', signal, err: errorMessage(err) });
        process.exit(1);
      });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  return () => {
    process.off('SIGINT', shutdown);
    process.off('SIGTERM', shutdown);
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

if (import.meta.main) {
  try {
    await start({ installSignalHandlers: true });
  } catch (err) {
    const logger = createPinoLogger({ service: 'news', pretty: false });
    logger.error({ kind: 'news_start_failed', err: errorMessage(err) });
    process.exit(1);
  }
}
