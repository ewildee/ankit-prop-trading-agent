export type CanonicalSymbol = 'NAS100' | 'XAUUSD';

export const CANONICAL_SYMBOLS: readonly CanonicalSymbol[] = ['NAS100', 'XAUUSD'] as const;

export type SymbolCatalogEntry = {
  canonical: CanonicalSymbol;
  twelveDataPrimaryAlias: string;
  twelveDataAliasFallbacks: readonly string[];
  exchange: string;
  instrumentType: 'Index' | 'Forex';
  currency: string;
  timezone: string;
  sessionCalendar: 'us-equity' | 'forex-24x5';
};

export const SYMBOL_CATALOG: Record<CanonicalSymbol, SymbolCatalogEntry> = {
  NAS100: {
    canonical: 'NAS100',
    twelveDataPrimaryAlias: 'NDX',
    twelveDataAliasFallbacks: ['NAS100', 'IXIC'],
    exchange: 'NASDAQ',
    instrumentType: 'Index',
    currency: 'USD',
    timezone: 'America/New_York',
    sessionCalendar: 'us-equity',
  },
  XAUUSD: {
    canonical: 'XAUUSD',
    twelveDataPrimaryAlias: 'XAU/USD',
    twelveDataAliasFallbacks: ['XAUUSD'],
    exchange: 'Physical Currency',
    instrumentType: 'Forex',
    currency: 'USD',
    timezone: 'UTC',
    sessionCalendar: 'forex-24x5',
  },
};

export function isCanonicalSymbol(s: string): s is CanonicalSymbol {
  return (CANONICAL_SYMBOLS as readonly string[]).includes(s);
}
