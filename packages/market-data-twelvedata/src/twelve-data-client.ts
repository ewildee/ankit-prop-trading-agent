import type { CreditRateLimiter } from './rate-limiter.ts';
import type { BarLine } from './schema.ts';
import { type Timeframe, twelveDataInterval } from './timeframes.ts';

export type TwelveDataClientCfg = {
  apiKey: string;
  rateLimiter: CreditRateLimiter;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  retries?: number;
  retryBackoffMs?: number;
};

export type TimeSeriesResponse = {
  bars: BarLine[];
  rawMeta: unknown;
  outputsizeRequested: number;
  attempts: number;
};

export type SymbolSearchResponse = {
  raw: unknown;
  bestMatch: { symbol: string; exchange?: string; type?: string; currency?: string } | null;
  attempts: number;
};

export const TWELVEDATA_DEFAULT_OUTPUTSIZE = 5000;

export class TwelveDataApiError extends Error {
  constructor(
    public readonly code: number | null,
    message: string,
    public readonly raw: unknown,
  ) {
    super(message);
    this.name = 'TwelveDataApiError';
  }
}

export class TwelveDataClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly rateLimiter: CreditRateLimiter;
  private readonly retries: number;
  private readonly retryBackoffMs: number;

  constructor(cfg: TwelveDataClientCfg) {
    if (!cfg.apiKey) throw new Error('TwelveDataClient: apiKey is required');
    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl ?? 'https://api.twelvedata.com';
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.rateLimiter = cfg.rateLimiter;
    this.retries = cfg.retries ?? 2;
    this.retryBackoffMs = cfg.retryBackoffMs ?? 2000;
  }

  async timeSeries(args: {
    tdSymbol: string;
    timeframe: Timeframe;
    startMs: number;
    endMs: number;
    outputsize?: number;
  }): Promise<TimeSeriesResponse> {
    const outputsizeRequested = args.outputsize ?? TWELVEDATA_DEFAULT_OUTPUTSIZE;
    const url = new URL('/time_series', this.baseUrl);
    url.searchParams.set('symbol', args.tdSymbol);
    url.searchParams.set('interval', twelveDataInterval(args.timeframe));
    url.searchParams.set('start_date', formatTwelveDataInstant(args.startMs));
    url.searchParams.set('end_date', formatTwelveDataInstant(args.endMs));
    url.searchParams.set('outputsize', String(outputsizeRequested));
    url.searchParams.set('format', 'JSON');
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('apikey', this.apiKey);
    const { json, attempts } = await this.callWithRetry(url);
    const obj = json as Record<string, unknown>;
    if (obj['status'] === 'error') {
      throw new TwelveDataApiError(
        typeof obj['code'] === 'number' ? (obj['code'] as number) : null,
        String(obj['message'] ?? 'twelvedata error'),
        obj,
      );
    }
    const values = Array.isArray(obj['values']) ? (obj['values'] as unknown[]) : [];
    const bars: BarLine[] = [];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v === null || typeof v !== 'object') {
        throw new TwelveDataApiError(
          null,
          `time_series row[${i}] is not an object: ${JSON.stringify(v)}`,
          v,
        );
      }
      const row = v as Record<string, unknown>;
      const dtRaw = row['datetime'];
      const dt = typeof dtRaw === 'string' ? dtRaw : '';
      const t = parseTwelveDataDatetime(dt, args.timeframe);
      if (t === null) {
        throw new TwelveDataApiError(
          null,
          `time_series row[${i}] has malformed datetime ${JSON.stringify(dtRaw)} for tf=${args.timeframe}`,
          row,
        );
      }
      const o = parseFiniteNumber(row['open'], 'open', i, row);
      const h = parseFiniteNumber(row['high'], 'high', i, row);
      const l = parseFiniteNumber(row['low'], 'low', i, row);
      const c = parseFiniteNumber(row['close'], 'close', i, row);
      const v_ = parseFiniteNumber(row['volume'] ?? 0, 'volume', i, row);
      bars.push({ t, o, h, l, c, v: v_ });
    }
    bars.sort((a, b) => a.t - b.t);
    return { bars, rawMeta: obj['meta'] ?? null, outputsizeRequested, attempts };
  }

  async symbolSearch(symbol: string): Promise<SymbolSearchResponse> {
    const url = new URL('/symbol_search', this.baseUrl);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('apikey', this.apiKey);
    const { json, attempts } = await this.callWithRetry(url);
    const obj = json as Record<string, unknown>;
    if (obj['status'] === 'error') {
      throw new TwelveDataApiError(
        typeof obj['code'] === 'number' ? (obj['code'] as number) : null,
        String(obj['message'] ?? 'twelvedata error'),
        obj,
      );
    }
    const data = Array.isArray(obj['data']) ? (obj['data'] as unknown[]) : [];
    const first = data[0] as Record<string, unknown> | undefined;
    if (!first) return { raw: obj, bestMatch: null, attempts };
    const bestMatch: { symbol: string; exchange?: string; type?: string; currency?: string } = {
      symbol: String(first['symbol'] ?? ''),
    };
    if (typeof first['exchange'] === 'string') bestMatch.exchange = first['exchange'];
    if (typeof first['instrument_type'] === 'string') bestMatch.type = first['instrument_type'];
    if (typeof first['currency'] === 'string') bestMatch.currency = first['currency'];
    return { raw: obj, bestMatch, attempts };
  }

  private async callWithRetry(url: URL): Promise<{ json: unknown; attempts: number }> {
    let lastErr: unknown;
    let attempts = 0;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      await this.rateLimiter.acquire(1);
      attempts = attempt + 1;
      try {
        const res = await this.fetchImpl(url.toString(), { method: 'GET' });
        if (res.status === 429) {
          lastErr = new TwelveDataApiError(429, 'rate-limited (HTTP 429)', null);
          if (attempt === this.retries) break;
          await sleep(this.retryBackoffMs * (attempt + 1));
          continue;
        }
        if (!res.ok) {
          throw new TwelveDataApiError(res.status, `HTTP ${res.status}`, await safeText(res));
        }
        return { json: await res.json(), attempts };
      } catch (err) {
        lastErr = err;
        if (attempt === this.retries) break;
        await sleep(this.retryBackoffMs * (attempt + 1));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}

function parseFiniteNumber(raw: unknown, field: string, rowIndex: number, row: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    throw new TwelveDataApiError(
      null,
      `time_series row[${rowIndex}] field "${field}" is not a finite number: ${JSON.stringify(raw)}`,
      row,
    );
  }
  return n;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

export function formatTwelveDataInstant(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mi = d.getUTCMinutes().toString().padStart(2, '0');
  const ss = d.getUTCSeconds().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

export function parseTwelveDataDatetime(dt: string, tf: Timeframe): number | null {
  if (!dt) return null;
  if (tf === '1d') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dt);
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/.exec(dt);
  if (!m) return null;
  return Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? '0'),
  );
}
