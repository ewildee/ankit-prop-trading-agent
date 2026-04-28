import { describe, expect, test } from 'bun:test';

import { SymbolTagMapSchema } from './symbol-tag-map.ts';

describe('SymbolTagMapSchema', () => {
  test('round-trips the operator symbol-tag map shape', () => {
    const parsed = SymbolTagMapSchema.parse({
      mappings: {
        USD: { affects: ['NAS100', 'XAUUSD'] },
        'US Indices': { affects: ['NAS100'] },
        EUR: { affects: [] },
      },
    });

    expect(parsed).toEqual({
      mappings: {
        USD: { affects: ['NAS100', 'XAUUSD'] },
        'US Indices': { affects: ['NAS100'] },
        EUR: { affects: [] },
      },
    });
  });

  test('rejects empty mapping keys and empty affected symbols', () => {
    expect(() =>
      SymbolTagMapSchema.parse({
        mappings: {
          '': { affects: ['NAS100'] },
        },
      }),
    ).toThrow();

    expect(() =>
      SymbolTagMapSchema.parse({
        mappings: {
          USD: { affects: [''] },
        },
      }),
    ).toThrow();
  });
});
