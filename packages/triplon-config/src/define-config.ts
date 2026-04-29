import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { z } from 'zod';

import { ConfigLoadError } from './errors.ts';

export interface DefineConfigOptions<S extends z.ZodType> {
  readonly schema: S;
  readonly sourceFile: string;
}

function firstIssuePath(err: z.ZodError): readonly (string | number)[] {
  return (err.issues[0]?.path ?? []).filter(
    (segment): segment is string | number =>
      typeof segment === 'string' || typeof segment === 'number',
  );
}

function formatValidationError(err: z.ZodError): string {
  return z.prettifyError(err);
}

export function defineConfig<S extends z.ZodType>(opts: DefineConfigOptions<S>): z.infer<S> {
  const sourceFile = resolve(process.cwd(), opts.sourceFile);
  if (!existsSync(sourceFile)) {
    throw new ConfigLoadError(`Config file not found: ${sourceFile}`, { sourceFile });
  }

  let raw: unknown;
  try {
    raw = Bun.YAML.parse(readFileSync(sourceFile, 'utf8'));
  } catch (err) {
    throw new ConfigLoadError(`${sourceFile}: YAML parse failed.`, {
      sourceFile,
      path: [],
      cause: err,
    });
  }

  const parsed = opts.schema.safeParse(raw);
  if (!parsed.success) {
    throw new ConfigLoadError(
      `${sourceFile}: configuration validation failed.\n${formatValidationError(parsed.error)}`,
      {
        sourceFile,
        path: firstIssuePath(parsed.error),
        cause: parsed.error,
      },
    );
  }
  return parsed.data as z.infer<S>;
}
