import { z } from 'zod';

const SymbolTagMapEntry = z.strictObject({
  affects: z.array(z.string().min(1)),
});

export const SymbolTagMapSchema = z.strictObject({
  mappings: z.record(z.string().min(1), SymbolTagMapEntry),
});
export type SymbolTagMap = z.infer<typeof SymbolTagMapSchema>;
