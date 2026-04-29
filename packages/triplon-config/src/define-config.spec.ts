import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineConfig } from './define-config.ts';
import { ConfigLoadError } from './errors.ts';
import { SymbolTagMapSchema } from './schemas/symbol-tag-map.ts';

describe('defineConfig', () => {
  test('parses the SymbolTagMap example through the registered schema', () => {
    const sourceFile = 'config/symbol-tag-map.example.yaml';
    const loaded = defineConfig({ schema: SymbolTagMapSchema, sourceFile });
    const direct = SymbolTagMapSchema.parse(Bun.YAML.parse(readFileSync(sourceFile, 'utf8')));

    expect(loaded).toEqual(direct);
    expect(loaded.mappings.USD?.affects).toEqual(['NAS100', 'XAUUSD']);
  });

  test('throws ConfigLoadError with the failing Zod path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'triplon-config-'));
    const sourceFile = join(dir, 'symbol-tag-map.config.yaml');
    await writeFile(sourceFile, 'mappings:\n  USD:\n    affects: [""]\n', 'utf8');

    try {
      defineConfig({ schema: SymbolTagMapSchema, sourceFile });
      throw new Error('expected defineConfig to fail');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigLoadError);
      expect((err as ConfigLoadError).path).toEqual(['mappings', 'USD', 'affects', 0]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('rejects unknown top-level keys through the strict schema', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'triplon-config-'));
    const sourceFile = join(dir, 'symbol-tag-map.config.yaml');
    await writeFile(sourceFile, 'mappings: {}\nextra: true\n', 'utf8');

    try {
      defineConfig({ schema: SymbolTagMapSchema, sourceFile });
      throw new Error('expected defineConfig to fail');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigLoadError);
      expect((err as ConfigLoadError).path).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
