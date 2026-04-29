import { describe, expect, test } from 'bun:test';
import { buildCuratedAdversarialWindows } from './adversarial-windows.ts';
import { AdversarialWindowsFileSchema, FIXTURE_SCHEMA_VERSION } from './schema.ts';

describe('buildCuratedAdversarialWindows', () => {
  const file = buildCuratedAdversarialWindows('2026-04-28');

  test('matches the AdversarialWindowsFile schema', () => {
    expect(() => AdversarialWindowsFileSchema.parse(file)).not.toThrow();
    expect(file.schemaVersion).toBe(FIXTURE_SCHEMA_VERSION);
  });

  test('every entry has a positive duration and at least one symbol', () => {
    for (const w of file.windows) {
      expect(w.endMs).toBeGreaterThan(w.startMs);
      expect(w.symbols.length).toBeGreaterThan(0);
    }
  });

  test('news entries pin eventTsMs to the print time inside the pre-window', () => {
    for (const w of file.windows.filter((entry) => entry.kind === 'news')) {
      expect(w.eventTsMs).toBe(w.startMs + 30 * 60_000);
      expect(w.endMs).toBe(w.eventTsMs + 30 * 60_000);
    }
    expect(file.windows.find((w) => w.id === 'nfp-2026-04-03')?.eventTsMs).toBe(
      Date.parse('2026-04-03T13:30:00Z'),
    );
    expect(file.windows.find((w) => w.id === 'fomc-2026-03-18')?.eventTsMs).toBe(
      Date.parse('2026-03-18T18:00:00Z'),
    );
    expect(file.windows.find((w) => w.id === 'ecb-2026-03-12')?.eventTsMs).toBe(
      Date.parse('2026-03-12T13:15:00Z'),
    );
  });

  test('closure entries pin eventTsMs to the closure start', () => {
    for (const w of file.windows.filter((entry) => entry.kind === 'holiday')) {
      expect(w.eventTsMs).toBe(w.startMs);
    }
  });

  test('covers NFP, FOMC, and ECB releases inside the locked window', () => {
    const cats = new Set(file.windows.filter((w) => w.kind === 'news').map((w) => w.category));
    expect(cats.has('NFP')).toBe(true);
    expect(cats.has('FOMC')).toBe(true);
    expect(cats.has('ECB')).toBe(true);
  });

  test('lists at least three US-equity holiday closures', () => {
    const closures = file.windows.filter(
      (w) => w.kind === 'holiday' && w.category === 'us-equity-closure',
    );
    expect(closures.length).toBeGreaterThanOrEqual(3);
    for (const c of closures) {
      expect(c.symbols).toEqual(['NAS100']);
      expect(c.impact).toBe('closure');
    }
  });

  test('every entry has a unique id', () => {
    const ids = file.windows.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
