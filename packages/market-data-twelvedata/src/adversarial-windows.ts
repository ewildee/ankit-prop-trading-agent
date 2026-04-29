import {
  type AdversarialWindow,
  type AdversarialWindowsFile,
  FIXTURE_SCHEMA_VERSION,
} from './schema.ts';

const ALL = ['NAS100', 'XAUUSD'] as const;
const US_EQUITY = ['NAS100'] as const;

function newsWindow(
  id: string,
  category: string,
  isoUtc: string,
  symbols: ReadonlyArray<string>,
  notes: string,
): AdversarialWindow {
  const t = Date.parse(isoUtc);
  return {
    id,
    kind: 'news',
    category,
    startMs: t - 30 * 60_000,
    endMs: t + 30 * 60_000,
    eventTsMs: t,
    symbols: [...symbols],
    impact: 'high',
    notes,
  };
}

function fullDayClosure(
  id: string,
  category: string,
  yyyyMmDd: string,
  symbols: ReadonlyArray<string>,
): AdversarialWindow {
  const start = Date.parse(`${yyyyMmDd}T00:00:00Z`);
  return {
    id,
    kind: 'holiday',
    category,
    startMs: start,
    endMs: start + 24 * 60 * 60_000,
    eventTsMs: start,
    symbols: [...symbols],
    impact: 'closure',
  };
}

export function buildCuratedAdversarialWindows(curatedAt: string): AdversarialWindowsFile {
  const windows: AdversarialWindow[] = [
    newsWindow('nfp-2025-11-07', 'NFP', '2025-11-07T13:30:00Z', ALL, 'US NFP — daily-tail only'),
    newsWindow('nfp-2025-12-05', 'NFP', '2025-12-05T13:30:00Z', ALL, 'US NFP — daily-tail only'),
    newsWindow('nfp-2026-01-02', 'NFP', '2026-01-02T13:30:00Z', ALL, 'US NFP — daily-tail only'),
    newsWindow('nfp-2026-02-06', 'NFP', '2026-02-06T13:30:00Z', ALL, 'US NFP'),
    newsWindow('nfp-2026-03-06', 'NFP', '2026-03-06T13:30:00Z', ALL, 'US NFP'),
    newsWindow(
      'nfp-2026-04-03',
      'NFP',
      '2026-04-03T13:30:00Z',
      ALL,
      'US NFP — falls on Good Friday',
    ),
    newsWindow('fomc-2025-10-29', 'FOMC', '2025-10-29T18:00:00Z', ALL, 'FOMC rate decision'),
    newsWindow('fomc-2025-12-10', 'FOMC', '2025-12-10T19:00:00Z', ALL, 'FOMC rate decision'),
    newsWindow('fomc-2026-01-28', 'FOMC', '2026-01-28T19:00:00Z', ALL, 'FOMC rate decision'),
    newsWindow('fomc-2026-03-18', 'FOMC', '2026-03-18T18:00:00Z', ALL, 'FOMC rate decision'),
    newsWindow('ecb-2025-10-30', 'ECB', '2025-10-30T13:15:00Z', ALL, 'ECB rate decision'),
    newsWindow('ecb-2025-12-18', 'ECB', '2025-12-18T13:15:00Z', ALL, 'ECB rate decision'),
    newsWindow('ecb-2026-01-29', 'ECB', '2026-01-29T13:15:00Z', ALL, 'ECB rate decision'),
    newsWindow('ecb-2026-03-12', 'ECB', '2026-03-12T13:15:00Z', ALL, 'ECB rate decision'),
    fullDayClosure('us-thanksgiving-2025', 'us-equity-closure', '2025-11-27', US_EQUITY),
    fullDayClosure('us-christmas-2025', 'us-equity-closure', '2025-12-25', US_EQUITY),
    fullDayClosure('us-newyear-2026', 'us-equity-closure', '2026-01-01', US_EQUITY),
    fullDayClosure('us-mlk-2026', 'us-equity-closure', '2026-01-19', US_EQUITY),
    fullDayClosure('us-presidents-2026', 'us-equity-closure', '2026-02-16', US_EQUITY),
    fullDayClosure('us-good-friday-2026', 'us-equity-closure', '2026-04-03', US_EQUITY),
  ];
  return {
    schemaVersion: FIXTURE_SCHEMA_VERSION,
    curatedAt,
    source: 'manual-curated',
    windows,
  };
}
