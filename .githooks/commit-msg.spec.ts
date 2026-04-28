import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

  async function runHook(
    name: string,
    contents: string,
    options: { gitRepo?: boolean; messageName?: string } = {},
  ) {
    const fixtureDir = join(tmpRoot, name);
    await mkdir(fixtureDir, { recursive: true });
    if (options.gitRepo) {
      const init = Bun.spawn(['git', 'init', '-q'], {
        cwd: fixtureDir,
        stderr: 'pipe',
        stdout: 'pipe',
      });
      expect(await init.exited).toBe(0);
    }

    const messagePath = join(fixtureDir, options.messageName ?? 'COMMIT_EDITMSG');
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

  test('rejects a spoofed merge subject without the Paperclip footer', async () => {
    const result = await runHook('spoofed-merge-subject', "Merge branch 'main' into feature\n");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain(requiredFooter);
  });

  test('allows the actual git merge message file', async () => {
    const result = await runHook('merge-commit', "Merge branch 'main' into feature\n", {
      gitRepo: true,
      messageName: '.git/MERGE_MSG',
    });

    expect(result.exitCode).toBe(0);
  });

  test('rejects fixup and squash subjects without the Paperclip footer', async () => {
    const fixupResult = await runHook('fixup-commit', 'fixup! chore: test\n');
    const squashResult = await runHook('squash-commit', 'squash! chore: test\n');

    expect(fixupResult.exitCode).not.toBe(0);
    expect(squashResult.exitCode).not.toBe(0);
  });

  async function copyInstaller(root: string) {
    const hookRoot = join(root, '.githooks');
    await mkdir(hookRoot, { recursive: true });
    const installerPath = join(hookRoot, 'install.sh');
    await copyFile(join(import.meta.dir, 'install.sh'), installerPath);
    await chmod(installerPath, 0o755);
    return installerPath;
  }

  test('postinstall hook installer sets hooksPath only for its own repository root', async () => {
    const fixtureDir = join(tmpRoot, 'installer-own-repo');
    await mkdir(fixtureDir, { recursive: true });
    const init = Bun.spawn(['git', 'init', '-q'], {
      cwd: fixtureDir,
      stderr: 'pipe',
      stdout: 'pipe',
    });
    expect(await init.exited).toBe(0);
    await copyInstaller(fixtureDir);

    const install = Bun.spawn(['sh', '.githooks/install.sh'], {
      cwd: fixtureDir,
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(await install.exited).toBe(0);
    const config = Bun.spawn(['git', 'config', '--get', 'core.hooksPath'], {
      cwd: fixtureDir,
      stderr: 'pipe',
      stdout: 'pipe',
    });
    const [configExit, stdout] = await Promise.all([
      config.exited,
      new Response(config.stdout).text(),
    ]);
    expect(configExit).toBe(0);
    expect(stdout.trim()).toBe('.githooks');
  });

  test('postinstall hook installer does not mutate a parent consumer repository', async () => {
    const consumerDir = join(tmpRoot, 'installer-consumer-repo');
    const packageDir = join(consumerDir, 'node_modules', 'ankit-prop-umbrella');
    await mkdir(packageDir, { recursive: true });
    const init = Bun.spawn(['git', 'init', '-q'], {
      cwd: consumerDir,
      stderr: 'pipe',
      stdout: 'pipe',
    });
    expect(await init.exited).toBe(0);
    await copyInstaller(packageDir);

    const install = Bun.spawn(['sh', '.githooks/install.sh'], {
      cwd: packageDir,
      stderr: 'pipe',
      stdout: 'pipe',
    });

    expect(await install.exited).toBe(0);
    const config = Bun.spawn(['git', 'config', '--get', 'core.hooksPath'], {
      cwd: consumerDir,
      stderr: 'pipe',
      stdout: 'pipe',
    });
    const [configExit, stdout] = await Promise.all([
      config.exited,
      new Response(config.stdout).text(),
    ]);
    expect(configExit).not.toBe(0);
    expect(stdout.trim()).toBe('');
  });
});
