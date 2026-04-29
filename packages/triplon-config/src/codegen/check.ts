import { runCodegen } from './run.ts';

const result = await runCodegen({ check: true });
if (result.changedFiles.length > 0) {
  console.error(
    [
      'Generated config artifacts are stale. Run `bun run config:codegen`.',
      ...result.changedFiles.map((path) => `- ${path}`),
    ].join('\n'),
  );
  process.exit(1);
}
