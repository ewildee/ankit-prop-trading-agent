import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';

const DEFAULT_OPERATOR_PATH = '~/.config/ankit-prop/symbol-tag-map.config.yaml';
const DEFAULT_EXAMPLE_PATH = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  'config',
  'symbol-tag-map.example.yaml',
);

const SymbolTagMapEntry = z.strictObject({
  affects: z.array(z.string().min(1)),
});

export const SymbolTagMapSchema = z.strictObject({
  mappings: z.record(z.string().min(1), SymbolTagMapEntry),
});
export type SymbolTagMap = z.infer<typeof SymbolTagMapSchema>;

export type SymbolTagMapLoadErrorCode = 'not_found' | 'invalid_yaml' | 'invalid_schema';

export class SymbolTagMapLoadError extends Error {
  readonly code: SymbolTagMapLoadErrorCode;
  readonly path: string | null;
  readonly attemptedPaths: readonly string[];

  constructor(params: {
    readonly code: SymbolTagMapLoadErrorCode;
    readonly message: string;
    readonly path?: string | null;
    readonly attemptedPaths?: readonly string[];
    readonly cause?: unknown;
  }) {
    super(params.message);
    this.name = 'SymbolTagMapLoadError';
    this.code = params.code;
    this.path = params.path ?? null;
    this.attemptedPaths = params.attemptedPaths ?? (params.path ? [params.path] : []);
    this.cause = params.cause;
  }
}

export interface LoadSymbolTagMapOptions {
  readonly fallbackPath?: string;
}

export interface SymbolTagMapLogger {
  warn(message: string, context?: Record<string, unknown>): void;
}

export async function loadSymbolTagMap(
  path?: string,
  options: LoadSymbolTagMapOptions = {},
): Promise<SymbolTagMap> {
  const primaryPath = resolvePath(path ?? DEFAULT_OPERATOR_PATH);
  const fallbackPath = options.fallbackPath
    ? resolvePath(options.fallbackPath)
    : path
      ? null
      : DEFAULT_EXAMPLE_PATH;
  const attemptedPaths = fallbackPath ? [primaryPath, fallbackPath] : [primaryPath];
  const loadPath = existsSync(primaryPath)
    ? primaryPath
    : fallbackPath && existsSync(fallbackPath)
      ? fallbackPath
      : null;

  if (!loadPath) {
    throw new SymbolTagMapLoadError({
      code: 'not_found',
      message: `symbol-tag-map config not found: ${attemptedPaths.join(', ')}`,
      path: primaryPath,
      attemptedPaths,
    });
  }

  const text = await Bun.file(loadPath).text();
  let raw: unknown;
  try {
    raw = Bun.YAML.parse(text);
  } catch (err) {
    throw new SymbolTagMapLoadError({
      code: 'invalid_yaml',
      message: `symbol-tag-map config invalid YAML at ${loadPath}: ${(err as Error).message}`,
      path: loadPath,
      attemptedPaths,
      cause: err,
    });
  }

  const result = SymbolTagMapSchema.safeParse(raw);
  if (!result.success) {
    throw new SymbolTagMapLoadError({
      code: 'invalid_schema',
      message: `symbol-tag-map config validation failed at ${loadPath}: ${result.error.message}`,
      path: loadPath,
      attemptedPaths,
      cause: result.error,
    });
  }

  return result.data;
}

export function resolveAffectedSymbols(
  rawInstrument: string,
  map: SymbolTagMap,
  logger?: SymbolTagMapLogger,
): string[] {
  const tags = rawInstrument
    .split(' + ')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  if (tags.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  const symbols: string[] = [];

  for (const tag of tags) {
    const mapped = map.mappings[tag];
    if (!mapped) {
      logger?.warn('symbol-tag-map: unknown FTMO instrument tag', { tag, rawInstrument });
      continue;
    }

    for (const symbol of mapped.affects) {
      if (!seen.has(symbol)) {
        seen.add(symbol);
        symbols.push(symbol);
      }
    }
  }

  return symbols;
}

function resolvePath(path: string): string {
  if (path === '~') {
    return homedir();
  }
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  return isAbsolute(path) ? path : join(process.cwd(), path);
}
