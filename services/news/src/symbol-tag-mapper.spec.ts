import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadSymbolTagMap,
  resolveAffectedSymbols,
  type SymbolTagMap,
  SymbolTagMapLoadError,
} from './symbol-tag-mapper.ts';

const MAP: SymbolTagMap = {
  mappings: {
    USD: { affects: ['NAS100', 'XAUUSD'] },
    'US Indices': { affects: ['NAS100'] },
    XAUUSD: { affects: ['XAUUSD'] },
    DXY: { affects: [] },
  },
};

describe('resolveAffectedSymbols', () => {
  test('maps a single tag to tracked symbols', () => {
    expect(resolveAffectedSymbols('USD', MAP)).toEqual(['NAS100', 'XAUUSD']);
  });

  test('splits multi-tag instruments and returns deterministic deduped symbols', () => {
    expect(resolveAffectedSymbols('USD + US Indices + XAUUSD + DXY', MAP)).toEqual([
      'NAS100',
      'XAUUSD',
    ]);
  });

  test('returns empty and warns for unknown tags', () => {
    const warnings: unknown[] = [];
    const logger = {
      warn(message: string, context?: Record<string, unknown>) {
        warnings.push({ message, context });
      },
    };

    expect(resolveAffectedSymbols('BRL', MAP, logger)).toEqual([]);
    expect(warnings).toEqual([
      {
        message: 'symbol-tag-map: unknown FTMO instrument tag',
        context: { tag: 'BRL', rawInstrument: 'BRL' },
      },
    ]);
  });

  test('returns empty for empty or whitespace-only instruments', () => {
    expect(resolveAffectedSymbols('', MAP)).toEqual([]);
    expect(resolveAffectedSymbols('   ', MAP)).toEqual([]);
  });
});

describe('loadSymbolTagMap', () => {
  test('falls back to the repo example when the operator file is missing', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'symbol-tag-map-'));
    try {
      const missingOperatorPath = join(tmp, 'missing.config.yaml');
      const map = await loadSymbolTagMap(missingOperatorPath, {
        fallbackPath: 'config/symbol-tag-map.example.yaml',
      });

      expect(resolveAffectedSymbols('USD + US Indices + XAUUSD + DXY', map)).toEqual([
        'NAS100',
        'XAUUSD',
      ]);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('raises structured errors for malformed operator YAML', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'symbol-tag-map-'));
    try {
      const malformed = join(tmp, 'operator.config.yaml');
      await writeFile(malformed, 'mappings: [', 'utf8');

      await expect(loadSymbolTagMap(malformed)).rejects.toMatchObject({
        name: 'SymbolTagMapLoadError',
        code: 'invalid_yaml',
        path: malformed,
      });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('raises structured errors for malformed fallback YAML', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'symbol-tag-map-'));
    try {
      const missingOperatorPath = join(tmp, 'missing.config.yaml');
      const malformedFallback = join(tmp, 'fallback.config.yaml');
      await writeFile(malformedFallback, 'mappings: [', 'utf8');

      await expect(
        loadSymbolTagMap(missingOperatorPath, { fallbackPath: malformedFallback }),
      ).rejects.toMatchObject({
        name: 'SymbolTagMapLoadError',
        code: 'invalid_yaml',
        path: malformedFallback,
        attemptedPaths: [missingOperatorPath, malformedFallback],
      });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('raises structured errors for schema-invalid YAML', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'symbol-tag-map-'));
    try {
      const invalidSchema = join(tmp, 'invalid-schema.config.yaml');
      await writeFile(invalidSchema, 'mappings:\n  USD: {}\n', 'utf8');

      const err = await loadSymbolTagMap(invalidSchema).catch((error) => error);
      expect(err).toBeInstanceOf(SymbolTagMapLoadError);
      expect(err).toMatchObject({
        code: 'invalid_schema',
        path: invalidSchema,
      });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
