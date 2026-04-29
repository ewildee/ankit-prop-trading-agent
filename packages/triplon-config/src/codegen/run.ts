import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { stableJson, toJsonSchema } from './json-schema.ts';
import { REGISTERED_CONFIG_SCHEMAS, type RegisteredConfigSchema } from './registry.ts';

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..', '..');
const CONFIG_DIR = join(REPO_ROOT, 'config');
const GENERATED_DIR = join(REPO_ROOT, 'packages', 'triplon-config', 'src', 'generated');

export interface CodegenOptions {
  readonly check?: boolean;
}

export interface CodegenResult {
  readonly changedFiles: readonly string[];
  readonly generatedFiles: readonly string[];
}

function exampleName(fileName: string): string {
  return fileName.replace(/\.example\.yaml$/, '');
}

function schemaJsonFor(schema: RegisteredConfigSchema): string {
  return stableJson({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://ankit-prop.local/schemas/${schema.name}.schema.json`,
    title: schema.title,
    ...toJsonSchema(schema.schema),
  });
}

function typesFor(schema: RegisteredConfigSchema): string {
  return [
    "import type { z } from 'zod';",
    `import type { ${schema.title}Schema } from '${schema.schemaImport}';`,
    '',
    `export type ${schema.typeName} = z.infer<typeof ${schema.title}Schema>;`,
    '',
  ].join('\n');
}

function loaderFor(schema: RegisteredConfigSchema): string {
  return [
    "import { defineAppConfig } from '../app-config.ts';",
    `import { ${schema.title}Schema } from '${schema.schemaImport}';`,
    `import type { ${schema.typeName} } from './${schema.name}.types.ts';`,
    '',
    `export type { ${schema.typeName} } from './${schema.name}.types.ts';`,
    '',
    `export function create${schema.title}Config() {`,
    '  return defineAppConfig({',
    "    scope: 'ankit-prop',",
    `    name: '${schema.name}',`,
    `    schema: ${schema.title}Schema,`,
    '    envOverrides: false,',
    '  });',
    '}',
    '',
    `export function load${schema.title}Config(path?: string): ${schema.typeName} {`,
    `  const handle = create${schema.title}Config();`,
    '  if (path !== undefined) {',
    '    handle.setConfigOverridePath(path);',
    '  }',
    '  return handle.getConfig();',
    '}',
    '',
  ].join('\n');
}

async function writeGenerated(path: string, content: string, check: boolean): Promise<boolean> {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === content) {
    return false;
  }
  if (!check) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }
  return true;
}

export async function runCodegen(opts: CodegenOptions = {}): Promise<CodegenResult> {
  const check = opts.check === true;
  const glob = new Bun.Glob('*.example.yaml');
  const examples = [...glob.scanSync({ cwd: CONFIG_DIR, onlyFiles: true })].sort();
  const changedFiles: string[] = [];
  const generatedFiles: string[] = [];

  for (const example of examples) {
    const schema = REGISTERED_CONFIG_SCHEMAS.get(exampleName(example));
    if (!schema) {
      continue;
    }

    const outputs = [
      {
        path: join(GENERATED_DIR, `${schema.name}.schema.json`),
        content: schemaJsonFor(schema),
      },
      {
        path: join(GENERATED_DIR, `${schema.name}.types.ts`),
        content: typesFor(schema),
      },
      {
        path: join(GENERATED_DIR, `${schema.name}.loader.ts`),
        content: loaderFor(schema),
      },
    ];

    for (const output of outputs) {
      generatedFiles.push(output.path);
      if (await writeGenerated(output.path, output.content, check)) {
        changedFiles.push(output.path);
      }
    }
  }

  return { changedFiles, generatedFiles };
}

if (import.meta.main) {
  const check = process.argv.includes('--check');
  const result = await runCodegen({ check });
  if (check && result.changedFiles.length > 0) {
    console.error(
      [
        'Generated config artifacts are stale. Run `bun run config:codegen`.',
        ...result.changedFiles.map((path) => `- ${path}`),
      ].join('\n'),
    );
    process.exit(1);
  }
}
