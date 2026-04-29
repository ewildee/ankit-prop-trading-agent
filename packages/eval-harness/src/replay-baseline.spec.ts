import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { type ReplaySnapshot, runReplaySnapshot } from './replay-cli.ts';

// Pin every external path to import.meta.dir so the test passes from any cwd
// (repo root or packages/eval-harness/). FIXTURE_ROOT lives at
// <repo>/data/market-data/...; baselines live at <pkg>/baselines/.
const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const FIXTURE_ROOT = join(REPO_ROOT, 'data/market-data/twelvedata/v1.0.0-2026-04-28');
const BASELINES_DIR = join(import.meta.dir, '..', 'baselines');
const BASELINES = [
  {
    file: 'noop_v1__v1.0.0-2026-04-28__xauusd_5m__smoke.json',
    strategyId: 'noop_v1',
    symbolSetId: 'xauusd_5m',
  },
  {
    file: 'open_hold_close_v1__v1.0.0-2026-04-28__xauusd_5m__smoke.json',
    strategyId: 'open_hold_close_v1',
    symbolSetId: 'xauusd_5m',
  },
] as const;

describe('replay baselines', () => {
  for (const baseline of BASELINES) {
    test(`${baseline.strategyId} ${baseline.symbolSetId} smoke snapshot matches baseline`, async () => {
      const expected = (await Bun.file(
        join(BASELINES_DIR, baseline.file),
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
