import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RunAggregate } from '@ankit-prop/contracts';
import { aggregateDecisionRecords, type ReflectorAggregate } from './aggregate.ts';
import { ingestDecisionJsonl } from './ingest.ts';

export type ReflectorReport = ReflectorAggregate & {
  readonly reportJsonPath: string;
  readonly reportMdPath: string;
};

export type WriteReflectorReportInput = {
  readonly runId: string;
  readonly decisionsPath?: string;
  readonly outputDir?: string;
};

export async function writeReflectorReport(
  input: WriteReflectorReportInput,
): Promise<ReflectorReport> {
  const outputDir = input.outputDir ?? join('.dev', 'runs', input.runId);
  const decisionsPath = input.decisionsPath ?? join(outputDir, 'decisions.jsonl');
  const records = await ingestDecisionJsonl(decisionsPath);
  const reflectorAggregate = aggregateDecisionRecords(records);
  const aggregate = RunAggregate.parse(reflectorAggregate.aggregate);
  await mkdir(outputDir, { recursive: true });

  const reportJsonPath = join(outputDir, 'report.json');
  const reportMdPath = join(outputDir, 'report.md');
  await writeFile(
    reportJsonPath,
    `${JSON.stringify({ ...reflectorAggregate, aggregate }, null, 2)}\n`,
  );
  await writeFile(reportMdPath, renderReportMarkdown({ ...reflectorAggregate, aggregate }));
  return { ...reflectorAggregate, aggregate, reportJsonPath, reportMdPath };
}

export function renderReportMarkdown(report: ReflectorAggregate): string {
  const { aggregate, sortino } = report;
  return [
    `# Reflector report: ${aggregate.runId}`,
    '',
    `- Persona: ${aggregate.personaId}`,
    `- Instrument: ${aggregate.instrument}`,
    `- Window: ${aggregate.startedAt} -> ${aggregate.endedAt ?? 'open'}`,
    `- Decisions: ${aggregate.decisionCount}`,
    `- Trades: ${aggregate.tradeCount}`,
    `- Analyst fallbacks: ${aggregate.analystFallbackCount}`,
    `- Gateway breaches: ${aggregate.breachCount}`,
    `- Realized PnL: ${formatUsd(aggregate.realizedPnl)}`,
    `- Sortino rolling 60d: ${formatRatio(aggregate.sortinoRolling60d)}`,
    `- LLM cost: ${formatUsd(aggregate.llmCostUsd.totalUsd)}`,
    '',
    '## Counts',
    '',
    `- Trader actions: ${JSON.stringify(aggregate.traderActions)}`,
    `- Judge verdicts: ${JSON.stringify(aggregate.judgeVerdicts)}`,
    `- Gateway outcomes: ${JSON.stringify(aggregate.gatewayOutcomes)}`,
    '',
    '## LLM cost',
    '',
    `- Cached input: ${formatUsd(aggregate.llmCostUsd.inputCachedUsd)}`,
    `- Fresh input: ${formatUsd(aggregate.llmCostUsd.inputFreshUsd)}`,
    `- Cache write: ${formatUsd(aggregate.llmCostUsd.inputCacheWriteUsd)}`,
    `- Output: ${formatUsd(aggregate.llmCostUsd.outputUsd)}`,
    `- Thinking: ${formatUsd(aggregate.llmCostUsd.thinkingUsd)}`,
    '',
    '## Sortino',
    '',
    `- Rolling window days: ${sortino.rollingWindowDays}`,
    `- Risk-free return: ${sortino.riskFreeReturn}`,
    `- Samples: ${sortino.sampleCount}`,
    `- Downside samples: ${sortino.downsideSampleCount}`,
    '',
  ].join('\n');
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}

function formatRatio(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : String(value);
}
