import { type CalendarItem as CalendarItemType, pragueDayBucket } from '@ankit-prop/contracts';

export interface InstrumentMatcher {
  resolveAffectedSymbols(rawInstrument: string): readonly string[];
}

export function normalizeInstruments(instruments: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const instrument of instruments) {
    const value = instrument.trim();
    if (value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

export function parseAtUtc(atUtc: string, context: string): number {
  const atMs = Date.parse(atUtc);
  if (!Number.isFinite(atMs)) {
    throw new RangeError(`${context}: invalid atUtc ${JSON.stringify(atUtc)}`);
  }
  return atMs;
}

export function pragueBucketsForWindow(fromMs: number, toMs: number): number[] {
  const buckets: number[] = [];
  const oneDayMs = 24 * 60 * 60 * 1000;
  const startBucket = pragueDayBucket(fromMs);
  const endBucket = pragueDayBucket(toMs);
  for (let bucket = startBucket; bucket <= endBucket; bucket += oneDayMs) {
    buckets.push(bucket);
  }
  return buckets;
}

export function matchesAnyInstrument(
  event: CalendarItemType,
  instruments: readonly string[],
  mapper: InstrumentMatcher,
): boolean {
  const affectedSymbols = mapper.resolveAffectedSymbols(event.instrument);
  return instruments.some((instrument) => affectedSymbols.includes(instrument));
}
