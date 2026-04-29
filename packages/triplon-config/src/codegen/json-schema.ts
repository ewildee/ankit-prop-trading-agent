import type { z } from 'zod';

type JsonSchema = Record<string, unknown>;

type ZodDef = {
  type?: string;
  shape?: Record<string, z.ZodType>;
  catchall?: z.ZodType;
  element?: z.ZodType;
  valueType?: z.ZodType;
  keyType?: z.ZodType;
  entries?: Record<string, string>;
  innerType?: z.ZodType;
};

function defOf(schema: z.ZodType): ZodDef {
  const candidate = schema as unknown as { def?: ZodDef; _def?: ZodDef };
  return candidate.def ?? candidate._def ?? {};
}

function minLengthOf(schema: z.ZodType): number | null {
  const candidate = schema as unknown as { minLength?: number | null };
  return typeof candidate.minLength === 'number' ? candidate.minLength : null;
}

function sortObject(input: JsonSchema): JsonSchema {
  const sorted: JsonSchema = {};
  for (const key of Object.keys(input).sort()) {
    sorted[key] = input[key];
  }
  return sorted;
}

function convertObject(def: ZodDef): JsonSchema {
  const properties: JsonSchema = {};
  const required: string[] = [];
  const shape = def.shape ?? {};

  for (const [key, value] of Object.entries(shape).sort(([a], [b]) => a.localeCompare(b))) {
    properties[key] = toJsonSchema(value);
    if (defOf(value).type !== 'optional') {
      required.push(key);
    }
  }

  const schema: JsonSchema = {
    type: 'object',
    properties,
  };
  if (required.length > 0) {
    schema.required = required;
  }
  if (defOf(def.catchall as z.ZodType).type === 'never') {
    schema.additionalProperties = false;
  }
  return schema;
}

function convertString(schema: z.ZodType): JsonSchema {
  const out: JsonSchema = { type: 'string' };
  const minLength = minLengthOf(schema);
  if (minLength !== null) {
    out.minLength = minLength;
  }
  return out;
}

export function toJsonSchema(schema: z.ZodType): JsonSchema {
  const def = defOf(schema);
  switch (def.type) {
    case 'object':
      return convertObject(def);
    case 'record': {
      const out: JsonSchema = {
        type: 'object',
        additionalProperties: toJsonSchema(def.valueType as z.ZodType),
      };
      const keyMinLength = minLengthOf(def.keyType as z.ZodType);
      if (keyMinLength !== null) {
        out.propertyNames = { type: 'string', minLength: keyMinLength };
      }
      return out;
    }
    case 'array':
      return {
        type: 'array',
        items: toJsonSchema(def.element as z.ZodType),
      };
    case 'string':
      return convertString(schema);
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'enum':
      return {
        type: 'string',
        enum: Object.values(def.entries ?? {}).sort(),
      };
    case 'optional':
      return toJsonSchema(def.innerType as z.ZodType);
    default:
      throw new Error(`Unsupported Zod schema kind for codegen: ${def.type ?? 'unknown'}`);
  }
}

export function stableJson(input: JsonSchema): string {
  return `${formatJson(sortDeep(input), 0)}\n`;
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep);
  }
  if (value && typeof value === 'object') {
    const out: JsonSchema = {};
    for (const [key, nested] of Object.entries(sortObject(value as JsonSchema))) {
      out[key] = sortDeep(nested);
    }
    return out;
  }
  return value;
}

function formatJson(value: unknown, indent: number): string {
  const space = ' '.repeat(indent);
  const childSpace = ' '.repeat(indent + 2);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((item) => item === null || typeof item !== 'object')) {
      return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
    }
    return `[\n${value.map((item) => `${childSpace}${formatJson(item, indent + 2)}`).join(',\n')}\n${space}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as JsonSchema);
    if (entries.length === 0) return '{}';
    return `{\n${entries
      .map(
        ([key, nested]) => `${childSpace}${JSON.stringify(key)}: ${formatJson(nested, indent + 2)}`,
      )
      .join(',\n')}\n${space}}`;
  }

  return JSON.stringify(value);
}
