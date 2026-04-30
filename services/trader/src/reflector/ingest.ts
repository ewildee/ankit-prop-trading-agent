import { DecisionRecord, type DecisionRecord as DecisionRecordType } from '@ankit-prop/contracts';

export async function ingestDecisionJsonl(path: string): Promise<DecisionRecordType[]> {
  const text = await Bun.file(path).text();
  const records: DecisionRecordType[] = [];
  const lines = text.split('\n');
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`invalid DecisionRecord JSON at ${path}:${index + 1}: ${String(error)}`);
    }
    try {
      records.push(DecisionRecord.parse(parsed));
    } catch (error) {
      throw new Error(`invalid DecisionRecord schema at ${path}:${index + 1}: ${String(error)}`);
    }
  }
  return records;
}
