// Canonical market-data primitives. Owned here so providers (cached fixtures
// today, cTrader live feed tomorrow) and consumers (eval-harness, trader) all
// agree on field names without re-encoding at the seam. eval-harness re-exports
// these as `Bar`/`SymbolMeta`/`CalendarEvent` for backward compatibility.

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export const SUPPORTED_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;

export type Bar = {
  symbol: string;
  timeframe: string;
  tsStart: number;
  tsEnd: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

// SymbolMeta exposes broker-side execution facts (pip / contract / spread)
// that the sim engine needs to size positions and price slippage. Provider-side
// identity fields (providerSymbol / exchange / sessionTz) are optional because
// pre-existing eval-harness fixtures predate them; CachedFixtureProvider
// always populates them from the captured `<symbol>.meta.json`.
export type SymbolMeta = {
  symbol: string;
  pipSize: number;
  contractSize: number;
  typicalSpreadPips: number;
  providerSymbol?: string;
  exchange?: string;
  sessionTz?: string;
};

// Broker-side execution specs injected into CachedFixtureProvider. The
// historical fetcher does not produce these — they live in broker config and
// stay pinned to cTrader-live data per ANKA-67 plan rev 2 ("no-threshold-
// calibration on TD data" invariant).
export type InstrumentSpec = {
  pipSize: number;
  contractSize: number;
  typicalSpreadPips: number;
};

export type CalendarEvent = {
  id: string;
  timestamp: number;
  symbols: string[];
  impact: 'low' | 'medium' | 'high';
  restricted: boolean;
};

export type MarketDataQuery = {
  readonly symbol: string;
  readonly timeframe: string;
  readonly fromMs: number; // inclusive
  readonly toMs: number; // exclusive
};

export type SymbolAvailability = {
  symbol: string;
  timeframes: readonly string[];
};

// Thrown when the provider has no fixture/feed for the requested
// symbol+timeframe pair — distinct from an empty range result, which means the
// provider is configured but the window contains no bars.
export class MarketDataNotAvailable extends Error {
  readonly symbol: string;
  readonly timeframe: string;
  constructor(symbol: string, timeframe: string, detail?: string) {
    super(`market-data: no fixture/feed for ${symbol}/${timeframe}${detail ? ` (${detail})` : ''}`);
    this.name = 'MarketDataNotAvailable';
    this.symbol = symbol;
    this.timeframe = timeframe;
  }
}
