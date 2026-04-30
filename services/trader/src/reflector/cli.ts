import { writeReflectorReport } from './report.ts';

const runId = readArgValue('--runId');
if (!runId) {
  throw new Error(
    'usage: bun run reflect --runId <id> [--decisionsPath <path>] [--outputDir <path>]',
  );
}

const decisionsPath = readArgValue('--decisionsPath');
const outputDir = readArgValue('--outputDir');
const report = await writeReflectorReport({
  runId,
  ...(decisionsPath ? { decisionsPath } : {}),
  ...(outputDir ? { outputDir } : {}),
});

console.log(`reflect ${report.aggregate.runId} report=${report.reportJsonPath}`);

function readArgValue(name: string): string | undefined {
  const index = Bun.argv.indexOf(name);
  return index === -1 ? undefined : Bun.argv[index + 1];
}
