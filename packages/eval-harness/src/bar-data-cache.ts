import { Database } from 'bun:sqlite';
import type { Bar } from './types.ts';

export interface BarFetcher {
  fetch(args: {
    symbol: string;
    timeframe: string;
    fromMs: number;
    toMs: number;
  }): Promise<ReadonlyArray<Bar>>;
}

export class NoFetcher implements BarFetcher {
  async fetch(): Promise<never> {
    throw new Error(
      'bar-data-cache: no fetcher configured; cTrader live fetch belongs to gateway (Phase 2). Provide bars via prefetch() instead.',
    );
  }
}

export class BarDataCache {
  private db: Database;
  private insertStmt: ReturnType<Database['prepare']>;
  private rangeStmt: ReturnType<Database['prepare']>;

  constructor(
    dbPath: string,
    private fetcher: BarFetcher = new NoFetcher(),
  ) {
    this.db = new Database(dbPath, { create: true });
    this.db.exec('PRAGMA journal_mode=WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bars (
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        ts_start INTEGER NOT NULL,
        ts_end INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume REAL NOT NULL,
        PRIMARY KEY (symbol, timeframe, ts_start)
      ) WITHOUT ROWID;
    `);
    this.insertStmt = this.db.prepare(
      'INSERT OR REPLACE INTO bars (symbol,timeframe,ts_start,ts_end,open,high,low,close,volume) VALUES (?,?,?,?,?,?,?,?,?)',
    );
    this.rangeStmt = this.db.prepare(
      'SELECT symbol,timeframe,ts_start,ts_end,open,high,low,close,volume FROM bars WHERE symbol=? AND timeframe=? AND ts_start>=? AND ts_start<? ORDER BY ts_start ASC',
    );
  }

  prefetch(bars: ReadonlyArray<Bar>): void {
    const tx = this.db.transaction((batch: ReadonlyArray<Bar>) => {
      for (const b of batch) {
        this.insertStmt.run(
          b.symbol,
          b.timeframe,
          b.tsStart,
          b.tsEnd,
          b.open,
          b.high,
          b.low,
          b.close,
          b.volume,
        );
      }
    });
    tx(bars);
  }

  async read(args: {
    symbol: string;
    timeframe: string;
    fromMs: number;
    toMs: number;
  }): Promise<Bar[]> {
    const cached = this.rangeStmt.all(
      args.symbol,
      args.timeframe,
      args.fromMs,
      args.toMs,
    ) as RawBarRow[];
    if (cached.length > 0) {
      return cached.map(rowToBar);
    }
    const fetched = await this.fetcher.fetch(args);
    if (fetched.length > 0) this.prefetch(fetched);
    return [...fetched];
  }

  close(): void {
    this.db.close();
  }
}

type RawBarRow = {
  symbol: string;
  timeframe: string;
  ts_start: number;
  ts_end: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function rowToBar(r: RawBarRow): Bar {
  return {
    symbol: r.symbol,
    timeframe: r.timeframe,
    tsStart: r.ts_start,
    tsEnd: r.ts_end,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  };
}
