import type { z } from 'zod';

import { SymbolTagMapSchema } from '../schemas/symbol-tag-map.ts';

export interface RegisteredConfigSchema {
  readonly name: string;
  readonly title: string;
  readonly typeName: string;
  readonly schema: z.ZodType;
  readonly schemaImport: string;
}

export const REGISTERED_CONFIG_SCHEMAS = new Map<string, RegisteredConfigSchema>([
  [
    'symbol-tag-map',
    {
      name: 'symbol-tag-map',
      title: 'SymbolTagMap',
      typeName: 'SymbolTagMap',
      schema: SymbolTagMapSchema,
      schemaImport: '../schemas/symbol-tag-map.ts',
    },
  ],
]);
