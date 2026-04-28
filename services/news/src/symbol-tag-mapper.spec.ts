import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigError } from '@triplon/config';

import {
  loadSymbolTagMap,
  resolveAffectedSymbols,
  type SymbolTagMap,
  SymbolTagMapSchema,
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
  test('keeps the shared SymbolTagMap schema re-export parseable for local consumers', () => {
    expect(SymbolTagMapSchema.parse(MAP)).toEqual(MAP);
  });

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

describe('loadSymbolTagMap (via @triplon/config)', () => {
  let originalCwd: string;
  let originalXdg: string | undefined;
  let originalHome: string | undefined;
  let sandbox: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalXdg = process.env.XDG_CONFIG_HOME;
    originalHome = process.env.HOME;
    sandbox = await mkdtemp(join(tmpdir(), 'symbol-tag-map-'));
    process.env.XDG_CONFIG_HOME = join(sandbox, 'xdg');
    process.env.HOME = join(sandbox, 'home');
    process.chdir(sandbox);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdg;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    await rm(sandbox, { recursive: true, force: true });
  });

  test('falls back to the bundled example when neither user nor project file exists', () => {
    const map = loadSymbolTagMap();
    expect(resolveAffectedSymbols('USD + US Indices + XAUUSD + DXY', map)).toEqual([
      'NAS100',
      'XAUUSD',
    ]);
  });

  test('loads from an explicit override path', async () => {
    const file = join(sandbox, 'override.config.yaml');
    await writeFile(file, 'mappings:\n  EUR:\n    affects: [DAX40]\n', 'utf8');
    const map = loadSymbolTagMap(file);
    expect(resolveAffectedSymbols('EUR', map)).toEqual(['DAX40']);
  });

  test('throws ConfigError E_CONFIG_NOT_FOUND for missing override path', () => {
    const missing = join(sandbox, 'missing.config.yaml');
    let caught: unknown;
    try {
      loadSymbolTagMap(missing);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    expect((caught as ConfigError).code).toBe('E_CONFIG_NOT_FOUND');
  });

  test('throws ConfigError E_CONFIG_PARSE for malformed YAML', async () => {
    const malformed = join(sandbox, 'malformed.config.yaml');
    await writeFile(malformed, 'mappings: [', 'utf8');
    let caught: unknown;
    try {
      loadSymbolTagMap(malformed);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    expect((caught as ConfigError).code).toBe('E_CONFIG_PARSE');
  });

  test('throws ConfigError E_CONFIG_INVALID for schema-invalid YAML', async () => {
    const bad = join(sandbox, 'bad-schema.config.yaml');
    await writeFile(bad, 'mappings:\n  USD: {}\n', 'utf8');
    let caught: unknown;
    try {
      loadSymbolTagMap(bad);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    expect((caught as ConfigError).code).toBe('E_CONFIG_INVALID');
  });
});
