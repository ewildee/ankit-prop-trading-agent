import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CalendarItem } from '@ankit-prop/contracts/news';
import { closeCalendarDb, openCalendarDb, upsertItems } from './calendar-db.ts';
import { createServer, type FetcherHealth } from './server.ts';

const BASE_ITEM: CalendarItem = {
  title: 'US Non-Farm Payrolls',
  impact: 'high',
  instrument: 'USD + US Indices + XAUUSD + DXY',
  restriction: true,
  eventType: 'normal',
  date: '2026-04-28T14:30:00+02:00',
  forecast: null,
  previous: null,
  actual: null,
  youtubeLink: null,
  articleLink: null,
};

describe('news server', () => {
  test('/calendar/restricted returns restricted inside a known restriction window', async () => {
    await withDb([BASE_ITEM], async (db) => {
      const server = createServer({ db, fetcherHealth: healthy(), version: '0.3.0-test' });

      const res = await server.fetch(
        req('/calendar/restricted?at=2026-04-28T12:32:00Z&instruments[]=XAUUSD'),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        restricted: true,
        reasons: [{ event: 'US Non-Farm Payrolls', eta_seconds: -120, rule: 'blackout_pm5' }],
      });
    });
  });

  test('/calendar/restricted maps FTMO tags to tracked symbols', async () => {
    await withDb([{ ...BASE_ITEM, instrument: 'USD' }], async (db) => {
      const server = createServer({ db, fetcherHealth: healthy() });

      const res = await server.fetch(
        req('/calendar/restricted?at=2026-04-28T12:32:00Z&instruments[]=XAUUSD'),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        restricted: true,
        reasons: [{ event: 'US Non-Farm Payrolls', eta_seconds: -120, rule: 'blackout_pm5' }],
      });
    });
  });

  test('/calendar/restricted includes previous Prague-day blackout overlap', async () => {
    await withDb(
      [
        {
          ...BASE_ITEM,
          date: '2026-07-15T23:59:00+02:00',
          title: 'Late Prague Restricted Event',
        },
      ],
      async (db) => {
        const server = createServer({ db, fetcherHealth: healthy() });

        const res = await server.fetch(
          req('/calendar/restricted?at=2026-07-15T22:02:00Z&instruments[]=XAUUSD'),
        );

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
          restricted: true,
          reasons: [
            { event: 'Late Prague Restricted Event', eta_seconds: -180, rule: 'blackout_pm5' },
          ],
        });
      },
    );
  });

  test('/calendar/restricted returns unrestricted outside any window', async () => {
    await withDb([BASE_ITEM], async (db) => {
      const server = createServer({ db, fetcherHealth: healthy() });

      const res = await server.fetch(
        req('/calendar/restricted?at=2026-04-28T13:00:00Z&instruments[]=XAUUSD'),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ restricted: false, reasons: [] });
    });
  });

  test('/calendar/pre-news-2h restricts tier-1 events in the pre-news window', async () => {
    await withDb([BASE_ITEM], async (db) => {
      const server = createServer({ db, fetcherHealth: healthy() });

      const res = await server.fetch(
        req('/calendar/pre-news-2h?at=2026-04-28T11:00:00Z&instruments[]=XAUUSD'),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        restricted: true,
        reasons: [{ event: 'US Non-Farm Payrolls', eta_seconds: 5400, rule: 'pre_news_2h' }],
      });
    });
  });

  test('/calendar/pre-news-2h maps FTMO tags to tracked symbols', async () => {
    await withDb([{ ...BASE_ITEM, instrument: 'USD' }], async (db) => {
      const server = createServer({ db, fetcherHealth: healthy() });

      const res = await server.fetch(
        req('/calendar/pre-news-2h?at=2026-04-28T11:00:00Z&instruments[]=NAS100'),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        restricted: true,
        reasons: [{ event: 'US Non-Farm Payrolls', eta_seconds: 5400, rule: 'pre_news_2h' }],
      });
    });
  });

  test('/calendar/pre-news-2h treats high-impact non-restricted events as tier-1', async () => {
    await withDb([{ ...BASE_ITEM, restriction: false, title: 'FOMC Statement' }], async (db) => {
      const server = createServer({ db, fetcherHealth: healthy() });

      const res = await server.fetch(
        req('/calendar/pre-news-2h?at=2026-04-28T11:00:00Z&instruments[]=XAUUSD'),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        restricted: true,
        reasons: [{ event: 'FOMC Statement', eta_seconds: 5400, rule: 'pre_news_2h' }],
      });
    });
  });

  test('ageSeconds = 7201 fails closed regardless of DB content', async () => {
    await withDb([], async (db) => {
      const server = createServer({ db, fetcherHealth: { ...healthy(), ageSeconds: 7201 } });

      const res = await server.fetch(
        req('/calendar/restricted?at=2026-04-28T13:00:00Z&instruments[]=XAUUSD'),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(staleReply());
    });
  });

  test('ageSeconds = null fails closed regardless of DB content', async () => {
    await withDb([], async (db) => {
      const server = createServer({ db, fetcherHealth: { ...healthy(), ageSeconds: null } });

      const res = await server.fetch(
        req('/calendar/restricted?at=2026-04-28T13:00:00Z&instruments[]=XAUUSD'),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(staleReply());
    });
  });

  test('db unhealthy fails closed regardless of DB content', async () => {
    await withDb([], async (db) => {
      const server = createServer({ db, fetcherHealth: { ...healthy(), dbOk: false } });

      const res = await server.fetch(
        req('/calendar/pre-news-2h?at=2026-04-28T13:00:00Z&instruments[]=XAUUSD'),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(staleReply());
    });
  });

  test('DB query error fails closed', async () => {
    await withDb([], async (db) => {
      const server = createServer({
        db,
        fetcherHealth: healthy(),
        queryRange: () => {
          throw new Error('calendar unavailable');
        },
      });

      const res = await server.fetch(
        req('/calendar/restricted?at=2026-04-28T13:00:00Z&instruments[]=XAUUSD'),
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(staleReply());
    });
  });

  test('rejects missing at with structured 400', async () => {
    await withDb([], async (db) => {
      const server = createServer({ db, fetcherHealth: healthy() });

      const res = await server.fetch(req('/calendar/restricted?instruments[]=XAUUSD'));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.code).toBe('invalid_query');
      expect(body.error.issues[0].path).toBe('at');
    });
  });

  test('rejects offsetless at with structured 400', async () => {
    await withDb([], async (db) => {
      const server = createServer({ db, fetcherHealth: healthy() });

      const res = await server.fetch(
        req('/calendar/restricted?at=2026-04-28T12:30:00&instruments[]=XAUUSD'),
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.code).toBe('invalid_query');
      expect(body.error.issues[0].path).toBe('at');
    });
  });

  test('rejects malformed instruments[] with structured 400', async () => {
    await withDb([], async (db) => {
      const server = createServer({ db, fetcherHealth: healthy() });

      const res = await server.fetch(
        req('/calendar/restricted?at=2026-04-28T12:30:00Z&instruments[]='),
      );
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.code).toBe('invalid_query');
      expect(body.error.issues[0].path).toBe('instruments.0');
    });
  });

  test('/health/details returns the details shape contract', async () => {
    await withDb([], async (db) => {
      const server = createServer({
        db,
        fetcherHealth: healthy(),
        version: '0.3.0-test',
      });

      const res = await server.fetch(req('/health/details'));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        ok: true,
        lastFetchAt: '2026-04-28T12:00:00Z',
        ageSeconds: 60,
        dbOk: true,
        version: '0.3.0-test',
      });
    });
  });
});

async function withDb(
  items: readonly CalendarItem[],
  run: (db: ReturnType<typeof openCalendarDb>) => Promise<void>,
) {
  const dir = await mkdtemp(join(tmpdir(), 'news-server-'));
  const db = openCalendarDb(join(dir, 'calendar.db'));
  try {
    upsertItems(db, items);
    await run(db);
  } finally {
    closeCalendarDb(db);
    await rm(dir, { force: true, recursive: true });
  }
}

function healthy(): FetcherHealth {
  return {
    lastFetchAt: '2026-04-28T12:00:00Z',
    ageSeconds: 60,
    dbOk: true,
  };
}

function req(path: string): Request {
  return new Request(`http://localhost:9203${path}`);
}

function staleReply() {
  return {
    restricted: true,
    reasons: [{ event: 'stale_calendar', eta_seconds: 0, rule: 'stale_calendar' }],
  };
}
