import type { z } from 'zod';
import type { SymbolTagMapSchema } from '../schemas/symbol-tag-map.ts';

export type SymbolTagMap = z.infer<typeof SymbolTagMapSchema>;
