import { afterEach, describe, expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { runCodegen } from './run.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..', '..');
const GENERATED_DIR = join(REPO_ROOT, 'packages', 'triplon-config', 'src', 'generated');
const SCHEMA_PATH = join(GENERATED_DIR, 'symbol-tag-map.schema.json');

async function restoreGenerated(): Promise<void> {
  await runCodegen();
}

describe('config codegen', () => {
  afterEach(async () => {
    await restoreGenerated();
  });

  test('check mode reports no changes for committed generated artifacts', async () => {
    await runCodegen();
    const result = await runCodegen({ check: true });
    expect(result.changedFiles).toEqual([]);
    expect(
      result.generatedFiles.map((path) => path.endsWith('symbol-tag-map.schema.json')),
    ).toContain(true);
  });

  test('emits deterministic SymbolTagMap schema and type artifacts', async () => {
    await runCodegen();
    const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8')) as Record<string, unknown>;
    expect(schema.title).toBe('SymbolTagMap');
    expect(schema.properties).toEqual({
      mappings: {
        additionalProperties: {
          additionalProperties: false,
          properties: {
            affects: {
              items: {
                minLength: 1,
                type: 'string',
              },
              type: 'array',
            },
          },
          required: ['affects'],
          type: 'object',
        },
        propertyNames: {
          minLength: 1,
          type: 'string',
        },
        type: 'object',
      },
    });
  });

  test('root --check exits non-zero when generated output is stale', async () => {
    await runCodegen();
    await writeFile(SCHEMA_PATH, `${await readFile(SCHEMA_PATH, 'utf8')} `, 'utf8');

    const proc = Bun.spawn(['bun', 'run', 'config:codegen', '--check'], {
      cwd: REPO_ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    const stderr = await new Response(proc.stderr).text();

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('Generated config artifacts are stale');
  });
});
