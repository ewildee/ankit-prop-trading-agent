import { describe, expect, test } from 'bun:test';
import { RestartPolicy } from './restart-policy.ts';
import { RestartCfg } from './types.ts';

function cfg(
  o: Partial<ReturnType<typeof RestartCfg.parse>> = {},
): ReturnType<typeof RestartCfg.parse> {
  return RestartCfg.parse({ ...o });
}

describe('RestartPolicy', () => {
  test('on-failure: clean exit (code 0) → no-restart', () => {
    const p = new RestartPolicy(cfg());
    const d = p.recordCrash({ exitCode: 0, signaled: false });
    expect(d.kind).toBe('no-restart');
  });

  test('on-failure: nonzero exit → restart with backoff', () => {
    let now = 1_000_000;
    const p = new RestartPolicy(cfg({ baseDelayMs: 100, maxDelayMs: 10_000 }), () => now);
    const d1 = p.recordCrash({ exitCode: 1, signaled: false });
    now += 1;
    const d2 = p.recordCrash({ exitCode: 1, signaled: false });
    expect(d1.kind).toBe('restart');
    expect(d2.kind).toBe('restart');
    if (d1.kind === 'restart' && d2.kind === 'restart') {
      expect(d2.delayMs).toBeGreaterThan(d1.delayMs);
    }
  });

  test('circuit-break: 4th crash inside 5-min window → circuit-broken (BLUEPRINT §23.4)', () => {
    let now = 0;
    const p = new RestartPolicy(cfg({ maxCrashes: 3, windowMs: 300_000 }), () => now);
    expect(p.recordCrash({ exitCode: 1, signaled: false }).kind).toBe('restart');
    now += 1_000;
    expect(p.recordCrash({ exitCode: 1, signaled: false }).kind).toBe('restart');
    now += 1_000;
    expect(p.recordCrash({ exitCode: 1, signaled: false }).kind).toBe('restart');
    now += 1_000;
    const d = p.recordCrash({ exitCode: 1, signaled: false });
    expect(d.kind).toBe('circuit-broken');
    if (d.kind === 'circuit-broken') {
      expect(d.crashesInWindow).toBe(4);
    }
  });

  test('crashes outside the window are evicted', () => {
    let now = 0;
    const p = new RestartPolicy(cfg({ maxCrashes: 3, windowMs: 1_000 }), () => now);
    expect(p.recordCrash({ exitCode: 1, signaled: false }).kind).toBe('restart');
    expect(p.recordCrash({ exitCode: 1, signaled: false }).kind).toBe('restart');
    expect(p.recordCrash({ exitCode: 1, signaled: false }).kind).toBe('restart');
    now += 5_000;
    const d = p.recordCrash({ exitCode: 1, signaled: false });
    expect(d.kind).toBe('restart');
    if (d.kind === 'restart') expect(d.crashesInWindow).toBe(1);
  });

  test('policy=never never restarts', () => {
    const p = new RestartPolicy(cfg({ policy: 'never' }));
    expect(p.recordCrash({ exitCode: 1, signaled: false }).kind).toBe('no-restart');
  });

  test('policy=always restarts on clean exit too', () => {
    const p = new RestartPolicy(cfg({ policy: 'always' }));
    expect(p.recordCrash({ exitCode: 0, signaled: false }).kind).toBe('restart');
  });

  test('signaled crash counts as failure under on-failure', () => {
    const p = new RestartPolicy(cfg());
    expect(p.recordCrash({ exitCode: null, signaled: true }).kind).toBe('restart');
  });
});
