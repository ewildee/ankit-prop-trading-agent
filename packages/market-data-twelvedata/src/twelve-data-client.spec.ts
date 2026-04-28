import { describe, expect, test } from 'bun:test';
import { CreditRateLimiter } from './rate-limiter.ts';
import {
  formatTwelveDataInstant,
  parseTwelveDataDatetime,
  TwelveDataApiError,
  TwelveDataClient,
} from './twelve-data-client.ts';

describe('parseTwelveDataDatetime', () => {
  test('parses intraday "YYYY-MM-DD HH:MM:SS" as UTC', () => {
    const t = parseTwelveDataDatetime('2026-01-28 14:30:00', '5m');
    expect(t).toBe(Date.UTC(2026, 0, 28, 14, 30, 0));
  });

  test('parses ISO-with-T variant', () => {
    const t = parseTwelveDataDatetime('2026-01-28T14:30:00', '15m');
    expect(t).toBe(Date.UTC(2026, 0, 28, 14, 30, 0));
  });

  test('parses 1d as midnight UTC of the date', () => {
    const t = parseTwelveDataDatetime('2026-01-28', '1d');
    expect(t).toBe(Date.UTC(2026, 0, 28));
  });

  test('returns null for malformed input', () => {
    expect(parseTwelveDataDatetime('', '1m')).toBeNull();
    expect(parseTwelveDataDatetime('not-a-date', '1m')).toBeNull();
  });
});

describe('formatTwelveDataInstant', () => {
  test('formats UTC ms as "YYYY-MM-DD HH:MM:SS" in UTC', () => {
    expect(formatTwelveDataInstant(Date.UTC(2026, 3, 28, 9, 0, 0))).toBe('2026-04-28 09:00:00');
  });
});

describe('TwelveDataClient', () => {
  test('timeSeries parses values and sorts ascending by t', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          status: 'ok',
          meta: { symbol: 'XAU/USD', interval: '5min' },
          values: [
            {
              datetime: '2026-01-28 14:35:00',
              open: '2300.0',
              high: '2301.0',
              low: '2299.0',
              close: '2300.5',
              volume: '0',
            },
            {
              datetime: '2026-01-28 14:30:00',
              open: '2299.5',
              high: '2300.5',
              low: '2298.5',
              close: '2300.0',
              volume: '0',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch;
    const client = new TwelveDataClient({
      apiKey: 'test',
      rateLimiter: new CreditRateLimiter({ creditsPerMinute: 1000 }),
      fetchImpl,
    });
    const res = await client.timeSeries({
      tdSymbol: 'XAU/USD',
      timeframe: '5m',
      startMs: Date.UTC(2026, 0, 28, 14, 0),
      endMs: Date.UTC(2026, 0, 28, 15, 0),
    });
    expect(res.bars).toHaveLength(2);
    expect(res.bars[0]!.t).toBeLessThan(res.bars[1]!.t);
    expect(res.bars[0]!.o).toBe(2299.5);
  });

  test('throws TwelveDataApiError on TD-level error envelope', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ status: 'error', code: 400, message: 'bad symbol' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof fetch;
    const client = new TwelveDataClient({
      apiKey: 'test',
      rateLimiter: new CreditRateLimiter({ creditsPerMinute: 1000 }),
      fetchImpl,
    });
    await expect(
      client.timeSeries({
        tdSymbol: 'BAD',
        timeframe: '1h',
        startMs: 0,
        endMs: 1,
      }),
    ).rejects.toBeInstanceOf(TwelveDataApiError);
  });

  test('throws on malformed datetime row (fail-closed for ANKA-72 BLOCK)', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          status: 'ok',
          meta: { symbol: 'XAU/USD', interval: '5min' },
          values: [
            {
              datetime: 'not-a-date',
              open: '2300.0',
              high: '2301.0',
              low: '2299.0',
              close: '2300.5',
              volume: '0',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch;
    const client = new TwelveDataClient({
      apiKey: 'test',
      rateLimiter: new CreditRateLimiter({ creditsPerMinute: 1000 }),
      fetchImpl,
    });
    await expect(
      client.timeSeries({
        tdSymbol: 'XAU/USD',
        timeframe: '5m',
        startMs: 0,
        endMs: 1,
      }),
    ).rejects.toBeInstanceOf(TwelveDataApiError);
  });

  test('throws on non-finite OHLCV (fail-closed for ANKA-72 BLOCK)', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          status: 'ok',
          meta: { symbol: 'XAU/USD', interval: '5min' },
          values: [
            {
              datetime: '2026-01-28 14:30:00',
              open: '2300.0',
              high: 'not-a-number',
              low: '2299.0',
              close: '2300.5',
              volume: '0',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch;
    const client = new TwelveDataClient({
      apiKey: 'test',
      rateLimiter: new CreditRateLimiter({ creditsPerMinute: 1000 }),
      fetchImpl,
    });
    await expect(
      client.timeSeries({
        tdSymbol: 'XAU/USD',
        timeframe: '5m',
        startMs: 0,
        endMs: 1,
      }),
    ).rejects.toBeInstanceOf(TwelveDataApiError);
  });

  test('attempts counter exposes HTTP retries on transient 429 (ANKA-72 manifest credit accuracy)', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({ message: 'rl' }), { status: 429 });
      }
      return new Response(JSON.stringify({ status: 'ok', meta: {}, values: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const client = new TwelveDataClient({
      apiKey: 'test',
      rateLimiter: new CreditRateLimiter({ creditsPerMinute: 1000 }),
      fetchImpl,
      retryBackoffMs: 1,
    });
    const res = await client.timeSeries({
      tdSymbol: 'XAU/USD',
      timeframe: '5m',
      startMs: 0,
      endMs: 1,
    });
    expect(res.attempts).toBe(2);
    expect(calls).toBe(2);
  });

  test('symbolSearch returns first match shape', async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              symbol: 'NDX',
              instrument_type: 'Index',
              exchange: 'NASDAQ',
              currency: 'USD',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as unknown as typeof fetch;
    const client = new TwelveDataClient({
      apiKey: 'test',
      rateLimiter: new CreditRateLimiter({ creditsPerMinute: 1000 }),
      fetchImpl,
    });
    const res = await client.symbolSearch('NAS100');
    expect(res.bestMatch?.symbol).toBe('NDX');
    expect(res.bestMatch?.exchange).toBe('NASDAQ');
  });
});
