import { describe, expect, test } from 'bun:test';

describe('news start entrypoint', () => {
  test('exits non-zero when the calendar DB path is unwriteable', async () => {
    const proc = Bun.spawn({
      cmd: [process.execPath, 'run', new URL('./start.ts', import.meta.url).pathname],
      env: {
        ...Bun.env,
        NEWS_CALENDAR_DB_PATH: '/dev/null/calendar.db',
        NODE_ENV: 'production',
        PORT: '0',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    expect(exitCode).not.toBe(0);
    expect(`${stdout}\n${stderr}`).toContain('news startup failed');
  });
});
