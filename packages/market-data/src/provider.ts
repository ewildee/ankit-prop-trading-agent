import type {
  Bar,
  CalendarEvent,
  MarketDataQuery,
  SymbolAvailability,
  SymbolMeta,
} from './types.ts';

// Provider-agnostic market-data contract. The seam between data sources
// (cached historical fixtures today, cTrader live feed tomorrow) and consumers
// (eval-harness replay driver, trader pipeline backtests, autoresearch eval).
//
// Stability rules for implementations:
//  - `listSymbols()` and `listAvailability()` MUST return identical contents
//    across the lifetime of a provider instance — no late-arriving symbols.
//    Implementations that need refresh semantics (e.g. live feed reconnect)
//    expose that out-of-band.
//  - `getBars()` MUST return bars ordered by `tsStart` ascending, with
//    `fromMs <= tsStart < toMs`. Empty result = window has no bars
//    (sparse-data case, e.g. weekend gap). Unknown symbol/timeframe MUST
//    throw `MarketDataNotAvailable` rather than silently returning [].
//  - `resolveSymbol()` MUST round-trip: `resolveSymbol(s.symbol)?.symbol === s.symbol`
//    for every `s` in `listSymbols()`.
//  - All time inputs/outputs are integer epoch milliseconds (UTC).
export interface IMarketDataProvider {
  listSymbols(): Promise<readonly SymbolMeta[]>;

  resolveSymbol(symbol: string): Promise<SymbolMeta | undefined>;

  listAvailability(): Promise<readonly SymbolAvailability[]>;

  getBars(query: MarketDataQuery): Promise<readonly Bar[]>;

  // Adversarial / calendar events that fall inside `[fromMs, toMs)`. Optional
  // because not every provider carries an event manifest (live cTrader feed
  // delegates to `svc:news`). Cached fixtures load this from the
  // `adversarial-windows.json` sibling file produced at fetch time.
  getEvents?(args: { fromMs: number; toMs: number }): Promise<readonly CalendarEvent[]>;
}
