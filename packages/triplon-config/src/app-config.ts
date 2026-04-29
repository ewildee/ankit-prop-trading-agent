import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { z } from 'zod';

import { ConfigError } from './errors.ts';

export type DefineAppConfigOptions<S extends z.ZodType> = {
  readonly scope: string;
  readonly name: string;
  readonly schema: S;
  readonly envPrefix?: string;
  readonly envOverrides?: boolean;
  readonly resolveSecrets?: (value: string) => string | Promise<string>;
};

export type EnvLeaf = {
  readonly path: readonly string[];
  readonly envVar: string;
  readonly coerce: 'string' | 'number' | 'boolean' | 'nullable-string' | 'enum';
  readonly enumValues: readonly string[] | null;
};

export type AppConfigHandle<S extends z.ZodType> = {
  getConfig(): z.infer<S>;
  setConfigOverridePath(path: string | null): void;
  resetCacheForTests(): void;
  paths: {
    user(): string;
    project(): string;
    override(): string | null;
  };
  writeJsonSchema(outputPath: string): Promise<void>;
  readonly envLeaves: readonly EnvLeaf[];
};

function xdgBase(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg && xdg.length > 0 ? xdg : resolve(homedir(), '.config');
}

function loadYamlMapping(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  if (text.trim().length === 0) return null;

  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(text);
  } catch (err) {
    throw new ConfigError('E_CONFIG_PARSE', `${path}: YAML parse failed.`, {
      path,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  if (parsed === null || parsed === undefined) return null;
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigError(
      'E_CONFIG_INVALID',
      `${path}: expected a YAML mapping at the top level.`,
      {
        path,
        actualType: Array.isArray(parsed) ? 'array' : typeof parsed,
      },
    );
  }
  return parsed as Record<string, unknown>;
}

function mergeMapping(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const existing = out[key];
    if (
      existing !== null &&
      typeof existing === 'object' &&
      !Array.isArray(existing) &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      out[key] = mergeMapping(
        existing as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function defineAppConfig<S extends z.ZodType>(
  opts: DefineAppConfigOptions<S>,
): AppConfigHandle<S> {
  let overridePath: string | null = null;
  let cached: z.infer<S> | null = null;

  function userPath(): string {
    return resolve(xdgBase(), opts.scope, `${opts.name}.config.yaml`);
  }

  function projectPath(): string {
    return resolve(process.cwd(), 'config', `${opts.name}.config.yaml`);
  }

  function load(): z.infer<S> {
    if (cached !== null) return cached;

    let fileLayer: Record<string, unknown> = {};
    if (overridePath !== null) {
      if (!existsSync(overridePath)) {
        throw new ConfigError('E_CONFIG_NOT_FOUND', `Config file not found: ${overridePath}`, {
          path: overridePath,
        });
      }
      fileLayer = loadYamlMapping(overridePath) ?? {};
    } else {
      // BLUEPRINT §17.1: user config is canonical, so it layers after project config.
      fileLayer = mergeMapping(fileLayer, loadYamlMapping(projectPath()) ?? {});
      fileLayer = mergeMapping(fileLayer, loadYamlMapping(userPath()) ?? {});
    }

    const parsed = opts.schema.safeParse(fileLayer);
    if (!parsed.success) {
      throw new ConfigError('E_CONFIG_INVALID', z.prettifyError(parsed.error), {
        issues: parsed.error.issues,
      });
    }
    cached = parsed.data as z.infer<S>;
    return cached;
  }

  return {
    getConfig: load,
    setConfigOverridePath(path: string | null): void {
      overridePath = path;
      cached = null;
    },
    resetCacheForTests(): void {
      overridePath = null;
      cached = null;
    },
    paths: {
      user: userPath,
      project: projectPath,
      override: () => overridePath,
    },
    async writeJsonSchema(_outputPath: string): Promise<void> {
      throw new ConfigError(
        'E_CONFIG_UNKNOWN',
        'writeJsonSchema is not implemented in this package scaffold.',
      );
    },
    envLeaves: [],
  };
}
