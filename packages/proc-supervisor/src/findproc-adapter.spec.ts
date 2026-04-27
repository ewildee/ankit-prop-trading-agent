import { describe, expect, test } from 'bun:test';
import { FakeFindProc } from './findproc-adapter.ts';

describe('FakeFindProc', () => {
  test('lists pids by port and reports liveness', async () => {
    const fp = new FakeFindProc();
    fp.setPortOwner(9999, [101, 102]);
    expect(await fp.findByPort(9999)).toEqual([101, 102]);
    expect(fp.isAlive(101)).toBe(true);
    expect(fp.isAlive(999)).toBe(false);
  });

  test('kill marks the pid dead and frees its port', async () => {
    const fp = new FakeFindProc();
    fp.setPortOwner(8000, [42]);
    expect(fp.kill(42, 'SIGTERM')).toBe(true);
    expect(fp.isAlive(42)).toBe(false);
    expect(await fp.findByPort(8000)).toEqual([]);
  });

  test('kill on dead pid returns false', () => {
    const fp = new FakeFindProc();
    expect(fp.kill(123, 'SIGKILL')).toBe(false);
  });
});
