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
