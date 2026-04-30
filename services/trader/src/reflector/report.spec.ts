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
      const aggregate = RunAggregate.parse(json.aggregate);
      expect(aggregate.realizedPnl).toBe(125);
      expect(aggregate.tradeCount).toBeGreaterThan(0);
      expect(aggregate.breachCount).toBe(0);
      expect(aggregate.llmCostUsd.totalUsd).toBeLessThanOrEqual(1.7);
      expect(json.sortino).toMatchObject({
        rollingWindowDays: 60,
        sampleCount: 1,
        downsideSampleCount: 0,
        sortinoRolling60d: 125,
      });
      expect(json.realizedPnlPoints).toEqual([
        { closedAt: '2026-04-27T14:45:02.000Z', realizedPnl: 125 },
      ]);

      const markdown = await readFile(report.reportMdPath, 'utf8');
      expect(markdown).toContain('# Reflector report: reflector-spec-run');
      expect(markdown).toContain('- Trades: 2');
      expect(markdown).toContain('- Gateway breaches: 0');
      expect(markdown).toContain('- Realized PnL: $125.000000');
      expect(markdown).toContain('- LLM cost: $0.000000');
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
