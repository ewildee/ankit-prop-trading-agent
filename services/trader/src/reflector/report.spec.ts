import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunAggregate } from '@ankit-prop/contracts';
import { writeReflectorReport } from './report.ts';
import { fixtureRun } from './test-fixtures.ts';

describe('writeReflectorReport', () => {
  test('writes parseable JSON and markdown reports from a fixture JSONL', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'reflector-report-'));
    try {
      const decisionsPath = join(tmp, 'decisions.jsonl');
      await writeFile(
        decisionsPath,
        `${fixtureRun()
          .map((record) => JSON.stringify(record))
          .join('\n')}\n`,
      );

      const report = await writeReflectorReport({
        runId: 'reflector-spec-run',
        decisionsPath,
        outputDir: tmp,
      });

      const json = JSON.parse(await readFile(report.reportJsonPath, 'utf8'));
      expect(() => RunAggregate.parse(json.aggregate)).not.toThrow();
      expect(json.aggregate.realizedPnl).toBe(125);
      expect(await readFile(report.reportMdPath, 'utf8')).toContain(
        '# Reflector report: reflector-spec-run',
      );
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
