import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { type SymbolTagMap, SymbolTagMapSchema } from '@ankit-prop/contracts/config';
import { defineAppConfig } from '@triplon/config';

export type { SymbolTagMap };
export { SymbolTagMapSchema };

export interface SymbolTagMapLogger {
  warn(message: string, context?: Record<string, unknown>): void;
}

const REPO_EXAMPLE_PATH = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  'config',
  'symbol-tag-map.example.yaml',
);

function makeHandle() {
  return defineAppConfig({
    scope: 'ankit-prop',
    name: 'symbol-tag-map',
    schema: SymbolTagMapSchema,
    // Mapping keys are arbitrary FTMO instrument tags; auto-derived env-var
    // overrides would only confuse the operator surface. Edits go through YAML.
    envOverrides: false,
  });
}

export function loadSymbolTagMap(path?: string): SymbolTagMap {
  const handle = makeHandle();
  if (path !== undefined) {
    handle.setConfigOverridePath(path);
    return handle.getConfig();
  }
  const userPath = handle.paths.user();
  const projectPath = handle.paths.project();
  if (!existsSync(userPath) && !existsSync(projectPath)) {
    handle.setConfigOverridePath(REPO_EXAMPLE_PATH);
  }
  return handle.getConfig();
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
