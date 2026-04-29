import { defineAppConfig } from '../app-config.ts';
import { SymbolTagMapSchema } from '../schemas/symbol-tag-map.ts';
import type { SymbolTagMap } from './symbol-tag-map.types.ts';

export type { SymbolTagMap } from './symbol-tag-map.types.ts';

export function createSymbolTagMapConfig() {
  return defineAppConfig({
    scope: 'ankit-prop',
    name: 'symbol-tag-map',
    schema: SymbolTagMapSchema,
    envOverrides: false,
  });
}

export function loadSymbolTagMapConfig(path?: string): SymbolTagMap {
  const handle = createSymbolTagMapConfig();
  if (path !== undefined) {
    handle.setConfigOverridePath(path);
  }
  return handle.getConfig();
}
