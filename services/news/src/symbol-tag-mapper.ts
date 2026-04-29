import type { SymbolTagMap } from './config/load-symbol-tag-map.ts';

export type { SymbolTagMap } from './config/load-symbol-tag-map.ts';
export { loadSymbolTagMap } from './config/load-symbol-tag-map.ts';

export interface SymbolTagMapLogger {
  warn(message: string, context?: Record<string, unknown>): void;
}

export function resolveAffectedSymbols(
  rawInstrument: string,
  map: SymbolTagMap,
  logger?: SymbolTagMapLogger,
): string[] {
  const tags = rawInstrument
    .split(' + ')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  if (tags.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const symbols: string[] = [];
  for (const tag of tags) {
    const mapped = map.mappings[tag];
    if (!mapped) {
      logger?.warn('symbol-tag-map: unknown FTMO instrument tag', { tag, rawInstrument });
      continue;
    }
    for (const symbol of mapped.affects) {
      if (!seen.has(symbol)) {
        seen.add(symbol);
        symbols.push(symbol);
      }
    }
  }
  return symbols;
}
