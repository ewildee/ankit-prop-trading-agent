import { describe, expect, test } from 'bun:test';
import {
  type CalendarItem,
  type NextRestrictedReply,
  RestrictedReply,
  type RestrictedReply as RestrictedReplyType,
  type TreatyClient,
} from '@ankit-prop/contracts';
import type { FreshnessMonitor, FreshnessSnapshot } from '../freshness/index.ts';
import type { App } from '../index.ts';
import type { SymbolTagMap } from '../symbol-tag-mapper.ts';
import { type CalendarRouteDb, calendarRoutes } from './calendar.ts';

const AT = '2026-04-29T10:00:00.000Z';
const EVENT: CalendarItem = {
  title: 'US Non-Farm Payrolls',
  impact: 'high',
  instrument: 'USD + US Indices + XAUUSD',
  restriction: true,
  eventType: 'normal',
  date: '2026-04-29T10:03:00.000Z',
  forecast: null,
  previous: null,
  actual: null,
  youtubeLink: null,
  articleLink: null,
};
const MAP: SymbolTagMap = {
  mappings: {
    USD: { affects: ['NAS100', 'XAUUSD'] },
    'US Indices': { affects: ['NAS100'] },
    XAUUSD: { affects: ['XAUUSD'] },
  },
};

describe('calendarRoutes', () => {
  test('GET /calendar/restricted delegates to the restricted-window evaluator', async () => {
    const app = makeApp();
    const res = await app.handle(
      new Request(`${baseUrl('/calendar/restricted')}?at=${AT}&instruments=XAUUSD`),
    );

    expect(res.status).toBe(200);
    expect(RestrictedReply.parse(await res.json())).toEqual({
      restricted: true,
      reasons: [{ event: EVENT.title, eta_seconds: 180, rule: 'blackout_pm5' }],
    });
  });

  test('GET /calendar/pre-news-2h delegates to the pre-news evaluator', async () => {
    const app = makeApp({ events: [{ ...EVENT, date: '2026-04-29T11:59:59.000Z' }] });
    const res = await app.handle(
      new Request(`${baseUrl('/calendar/pre-news-2h')}?at=${AT}&instruments=NAS100`),
    );

    expect(res.status).toBe(200);
    expect(RestrictedReply.parse(await res.json())).toEqual({
      restricted: true,
      reasons: [{ event: EVENT.title, eta_seconds: 7199, rule: 'pre_news_2h' }],
    });
  });

  test('GET /calendar/next-restricted delegates to the next-restricted locator', async () => {
    const app = makeApp();
    const res = await app.handle(
      new Request(`${baseUrl('/calendar/next-restricted')}?at=${AT}&instruments=XAUUSD`),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as NextRestrictedReply;
    expect(body.item?.title).toBe(EVENT.title);
    expect(body.eta_seconds).toBe(180);
  });

  test('GET /calendar/window returns calendar items inside the requested UTC window', async () => {
    const app = makeApp();
    const res = await app.handle(
      new Request(
        `${baseUrl('/calendar/window')}?from=2026-04-29T09:00:00.000Z&to=2026-04-29T12:00:00.000Z&instruments=XAUUSD`,
      ),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([EVENT]);
  });

  test('GET /calendar/window filters events to requested affected instruments', async () => {
    const app = makeApp();
    const xauusd = await app.handle(
      new Request(
        `${baseUrl('/calendar/window')}?from=2026-04-29T09:00:00.000Z&to=2026-04-29T12:00:00.000Z&instruments=XAUUSD`,
      ),
    );
    const btcusd = await app.handle(
      new Request(
        `${baseUrl('/calendar/window')}?from=2026-04-29T09:00:00.000Z&to=2026-04-29T12:00:00.000Z&instruments=BTCUSD`,
      ),
    );

    expect(xauusd.status).toBe(200);
    expect(await xauusd.json()).toEqual([EVENT]);
    expect(btcusd.status).toBe(200);
    expect(await btcusd.json()).toEqual([]);
  });

  test('GET /calendar/by-day returns events for the requested Prague day', async () => {
    const app = makeApp();
    const res = await app.handle(new Request(`${baseUrl('/calendar/by-day')}?day=2026-04-29`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([EVENT]);
  });

  test.each([
    '/calendar/restricted',
    '/calendar/pre-news-2h',
    '/calendar/next-restricted',
  ])('%s rejects comma-separated instruments', async (path) => {
    const res = await makeApp().handle(
      new Request(`${baseUrl(path)}?at=${AT}&instruments=NAS100,XAUUSD`),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'instruments must be repeated, not comma-separated',
    });
  });

  test('GET /calendar/window rejects missing instruments', async () => {
    const res = await makeApp().handle(
      new Request(
        `${baseUrl('/calendar/window')}?from=2026-04-29T09:00:00.000Z&to=2026-04-29T12:00:00.000Z`,
      ),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'instruments query params are required' });
  });

  test('GET /calendar/window rejects comma-separated instruments', async () => {
    const res = await makeApp().handle(
      new Request(
        `${baseUrl('/calendar/window')}?from=2026-04-29T09:00:00.000Z&to=2026-04-29T12:00:00.000Z&instruments=NAS100,XAUUSD`,
      ),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'instruments must be repeated, not comma-separated',
    });
  });

  test('GET /calendar/window rejects singular instrument', async () => {
    const res = await makeApp().handle(
      new Request(
        `${baseUrl('/calendar/window')}?from=2026-04-29T09:00:00.000Z&to=2026-04-29T12:00:00.000Z&instrument=NAS100`,
      ),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'use repeated instruments query params' });
  });

  test.each([
    '/calendar/restricted',
    '/calendar/pre-news-2h',
    '/calendar/next-restricted',
  ])('%s rejects bad at timestamps', async (path) => {
    const res = await makeApp().handle(
      new Request(`${baseUrl(path)}?at=2026-04-29T10:00:00%2B02:00&instruments=XAUUSD`),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'at must be a UTC RFC-3339 instant' });
  });

  test.each([
    '2026-99-99',
    '2026-02-30',
  ])('GET /calendar/by-day rejects impossible day %s', async (day) => {
    const res = await makeApp().handle(new Request(`${baseUrl('/calendar/by-day')}?day=${day}`));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'day must be a valid YYYY-MM-DD date' });
  });

  test.each([
    ['/calendar/restricted?at=2026-04-29T10:00:00.000Z&instruments=XAUUSD', 200],
    ['/calendar/pre-news-2h?at=2026-04-29T10:00:00.000Z&instruments=XAUUSD', 200],
    [
      '/calendar/window?from=2026-04-29T09:00:00.000Z&to=2026-04-29T12:00:00.000Z&instruments=XAUUSD',
      200,
    ],
    ['/calendar/by-day?day=2026-04-29', 200],
  ] satisfies ReadonlyArray<
    readonly [string, number]
  >)('%s fail-closes to RestrictedReply when freshness is stale', async (path, status) => {
    const res = await makeApp({ freshness: staleFreshness() }).handle(new Request(baseUrl(path)));

    expect(res.status).toBe(status);
    const body = RestrictedReply.parse(await res.json());
    expect(body).toEqual(staleReply());
  });

  test('/calendar/next-restricted returns the fail-closed contract shape with 503 when stale', async () => {
    const res = await makeApp({ freshness: staleFreshness() }).handle(
      new Request(`${baseUrl('/calendar/next-restricted')}?at=${AT}&instruments=XAUUSD`),
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ item: null, eta_seconds: 0 });
  });

  test('exported Treaty App type includes calendar routes', () => {
    type Client = TreatyClient<App>;
    type RestrictedData = Awaited<ReturnType<Client['calendar']['restricted']['get']>>['data'];

    const _typecheck: RestrictedData extends RestrictedReplyType | { error: string } | null
      ? true
      : false = true;
    expect(_typecheck).toBe(true);
  });
});

function makeApp(
  opts: { readonly events?: readonly CalendarItem[]; readonly freshness?: FreshnessMonitor } = {},
) {
  return calendarRoutes({
    db: fakeDb(opts.events ?? [EVENT]),
    freshness: opts.freshness ?? freshFreshness(),
    mapper: MAP,
    clock: {
      now: () => Date.parse(AT),
      nowUtc: () => AT,
    },
  });
}

function fakeDb(events: readonly CalendarItem[]): CalendarRouteDb {
  return {
    selectEventsBetween() {
      return events;
    },
    selectEventsForPragueDay() {
      return events;
    },
  };
}

function freshFreshness(): FreshnessMonitor {
  return freshness({ ageSeconds: 60, fresh: true, lastFetchAtUtc: AT, reason: 'fresh' });
}

function staleFreshness(): FreshnessMonitor {
  return freshness({
    ageSeconds: 7_201,
    fresh: false,
    lastFetchAtUtc: '2026-04-29T07:59:59.000Z',
    reason: 'stale_calendar',
  });
}

function freshness(snapshot: FreshnessSnapshot): FreshnessMonitor {
  return {
    currentSnapshot: () => snapshot,
  };
}

function staleReply(): RestrictedReplyType {
  return {
    restricted: true,
    reasons: [{ event: 'stale_calendar', eta_seconds: 0, rule: 'stale_calendar' }],
  };
}

function baseUrl(path: string): string {
  return `http://news.test${path}`;
}
