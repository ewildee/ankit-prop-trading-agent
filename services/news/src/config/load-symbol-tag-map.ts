import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  createSymbolTagMapConfig,
  loadSymbolTagMapConfig,
  type SymbolTagMap,
} from '@triplon/config/generated/symbol-tag-map';

export type { SymbolTagMap };

const SERVICE_DEFAULT_PATH = join(import.meta.dir, '..', '..', 'config', 'symbol-tag-map.yaml');

export function loadSymbolTagMap(path?: string): SymbolTagMap {
  if (path !== undefined) {
    return loadSymbolTagMapConfig(path);
  }

  const handle = createSymbolTagMapConfig();
  if (!existsSync(handle.paths.user()) && !existsSync(handle.paths.project())) {
    handle.setConfigOverridePath(SERVICE_DEFAULT_PATH);
  }
  return handle.getConfig();
}
