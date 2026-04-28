import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hookPath = join(import.meta.dir, 'commit-msg');
const requiredFooter = 'Co-Authored-By: Paperclip <noreply@paperclip.ing>';

describe('commit-msg hook', () => {
  let tmpRoot: string;

  beforeAll(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'ankit-commit-msg-'));
  });

  afterAll(async () => {
    await rm(tmpRoot, { force: true, recursive: true });
  });

  async function runHook(name: string, contents: string) {
    const fixtureDir = join(tmpRoot, name);
    await mkdir(fixtureDir, { recursive: true });
    const messagePath = join(fixtureDir, 'COMMIT_EDITMSG');
    await writeFile(messagePath, contents);

    const proc = Bun.spawn([hookPath, messagePath], {
      cwd: fixtureDir,
      stderr: 'pipe',
      stdout: 'pipe',
    });

    const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);

    return { exitCode, stderr };
  }

  test('rejects a normal commit message without the Paperclip footer', async () => {
    const result = await runHook('missing-footer', 'chore: test\n');

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(requiredFooter);
  });

  test('allows a normal commit message with the Paperclip footer', async () => {
    const result = await runHook('with-footer', `chore: test\n\n${requiredFooter}\n`);

    expect(result.exitCode).toBe(0);
  });

  test('allows merge commit messages', async () => {
    const result = await runHook('merge-commit', "Merge branch 'main' into feature\n");

    expect(result.exitCode).toBe(0);
  });

  test('allows fixup and squash commit messages', async () => {
    const fixupResult = await runHook('fixup-commit', 'fixup! chore: test\n');
    const squashResult = await runHook('squash-commit', 'squash! chore: test\n');

    expect(fixupResult.exitCode).toBe(0);
    expect(squashResult.exitCode).toBe(0);
  });
});
