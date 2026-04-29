import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defineAppConfig } from './app-config.ts';
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

describe('defineAppConfig', () => {
  let originalCwd: string;
  let originalXdg: string | undefined;
  let originalHome: string | undefined;
  let sandbox: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalXdg = process.env.XDG_CONFIG_HOME;
    originalHome = process.env.HOME;
    sandbox = await mkdtemp(join(tmpdir(), 'triplon-app-config-'));
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

  test('loads project config from config/<name>.config.yaml', async () => {
    const configDir = join(sandbox, 'config');
    await mkdir(configDir, { recursive: true });
    await writeFile(
      join(configDir, 'symbol-tag-map.config.yaml'),
      'mappings:\n  EUR:\n    affects: [DAX40]\n',
      'utf8',
    );

    // services/news exercises the same operator-facing SymbolTagMap path.
    const handle = defineAppConfig({
      scope: 'ankit-prop',
      name: 'symbol-tag-map',
      schema: SymbolTagMapSchema,
      envOverrides: false,
    });

    expect(handle.paths.project()).toBe(
      join(process.cwd(), 'config', 'symbol-tag-map.config.yaml'),
    );
    expect(handle.getConfig().mappings.EUR?.affects).toEqual(['DAX40']);
    expect(handle.getConfig().mappings.USD).toBeUndefined();
  });

  test('layers user config over project config', async () => {
    const projectConfigDir = join(sandbox, 'config');
    const userConfigDir = join(sandbox, 'xdg', 'ankit-prop');
    await mkdir(projectConfigDir, { recursive: true });
    await mkdir(userConfigDir, { recursive: true });
    await writeFile(
      join(projectConfigDir, 'symbol-tag-map.config.yaml'),
      'mappings:\n  EUR:\n    affects: [DAX40]\n',
      'utf8',
    );
    await writeFile(
      join(userConfigDir, 'symbol-tag-map.config.yaml'),
      'mappings:\n  EUR:\n    affects: [DAX40, GER40.cash]\n',
      'utf8',
    );

    const handle = defineAppConfig({
      scope: 'ankit-prop',
      name: 'symbol-tag-map',
      schema: SymbolTagMapSchema,
      envOverrides: false,
    });

    expect(handle.getConfig().mappings.EUR?.affects).toEqual(['DAX40', 'GER40.cash']);
  });
});
