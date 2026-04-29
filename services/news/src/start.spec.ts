import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pkgJson from '../package.json' with { type: 'json' };
import { CalendarDbOpenError } from './calendar-db.ts';
import { type NewsProcess, start } from './start.ts';

const ITEM = {
  title: 'US Non-Farm Payrolls',
  impact: 'high',
  instrument: 'USD',
  restriction: true,
  eventType: 'normal',
  date: '2026-04-28T14:30:00+02:00',
  forecast: null,
  previous: null,
  actual: null,
  youtubeLink: null,
  articleLink: null,
};

describe('news start', () => {
  let handle: NewsProcess | undefined;

  afterEach(async () => {
    if (handle !== undefined) {
      await handle.stop();
      handle = undefined;
    }
  });

  test('boots DB, fetcher, and server; /health/details includes package version', async () => {
    await withTmpDir(async (dir) => {
      handle = await start({
        dbPath: join(dir, 'calendar.db'),
        port: 0,
        fetch: jsonFetch({ items: [ITEM] }),
        logger: silentLogger(),
      });

      await eventually(async () => {
        const res = await fetch(`http://localhost:${handle?.port}/health/details`);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { ok?: unknown; dbOk?: unknown; version?: unknown };
        expect(body.ok).toBe(true);
        expect(body.dbOk).toBe(true);
        expect(body.version).toBe(pkgJson.version);
      });
    });
  });

  test('rejects with CalendarDbOpenError before binding a server when DB is unwriteable', async () => {
    await withTmpDir(async (dir) => {
      const dbPath = join(dir, 'directory-instead-of-db');
      await mkdir(dbPath);

      let caught: unknown;
      try {
        await start({
          dbPath,
          port: 0,
          fetch: jsonFetch({ items: [ITEM] }),
          logger: silentLogger(),
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(CalendarDbOpenError);
      expect((caught as CalendarDbOpenError).code).toBe('unwriteable_path');
    });
  });

  test('stop is idempotent', async () => {
    await withTmpDir(async (dir) => {
      handle = await start({
        dbPath: join(dir, 'calendar.db'),
        port: 0,
        fetch: jsonFetch({ items: [ITEM] }),
        logger: silentLogger(),
      });

      await handle.stop();
      await handle.stop();
      handle = undefined;
    });
  });
});

async function withTmpDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'news-start-'));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function jsonFetch(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

function silentLogger() {
  return {
    error() {},
    warn() {},
    info() {},
  };
}

async function eventually(assertion: () => Promise<void>): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await assertion();
      return;
    } catch (err) {
      last = err;
      await Bun.sleep(25);
    }
  }
  throw last;
}
