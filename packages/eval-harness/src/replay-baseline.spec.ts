import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { type ReplaySnapshot, runReplaySnapshot } from './replay-cli.ts';

const FIXTURE_ROOT = 'data/market-data/twelvedata/v1.0.0-2026-04-28';
const BASELINES = [
  {
    path: 'packages/eval-harness/baselines/noop_v1__v1.0.0-2026-04-28__xauusd_5m__smoke.json',
    strategyId: 'noop_v1',
    symbolSetId: 'xauusd_5m',
  },
  {
    path: 'packages/eval-harness/baselines/open_hold_close_v1__v1.0.0-2026-04-28__xauusd_5m__smoke.json',
    strategyId: 'open_hold_close_v1',
    symbolSetId: 'xauusd_5m',
  },
] as const;

describe('replay baselines', () => {
  for (const baseline of BASELINES) {
    test(`${baseline.strategyId} ${baseline.symbolSetId} smoke snapshot matches baseline`, async () => {
      const expected = (await Bun.file(
        join(process.cwd(), baseline.path),
      ).json()) as ReplaySnapshot;
      const actual = await runReplaySnapshot({
        fixtureRoot: FIXTURE_ROOT,
        strategyId: baseline.strategyId,
        symbolSetId: baseline.symbolSetId,
        windowMode: 'smoke',
      });

      expect(actual).toEqual(expected);
    });
  }
});
