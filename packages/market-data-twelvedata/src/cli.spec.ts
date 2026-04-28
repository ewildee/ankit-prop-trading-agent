import { describe, expect, test } from 'bun:test';
import { dirname, join } from 'node:path';
import { chdir, cwd } from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveDefaultRootDir } from './cli.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('td-fetch CLI defaults', () => {
  test('default fixture root anchors at repo root regardless of process cwd', () => {
    const oldCwd = cwd();
    try {
      chdir(join(repoRoot, 'packages', 'market-data-twelvedata'));
      expect(resolveDefaultRootDir('v-root-pin')).toBe(
        join(repoRoot, 'data', 'market-data', 'twelvedata', 'v-root-pin'),
      );
    } finally {
      chdir(oldCwd);
    }
  });
});
