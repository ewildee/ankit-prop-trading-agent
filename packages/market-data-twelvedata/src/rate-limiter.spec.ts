import { describe, expect, test } from 'bun:test';
import { CreditRateLimiter } from './rate-limiter.ts';

describe('CreditRateLimiter', () => {
  test('rejects credits per request that exceed the per-minute ceiling', async () => {
    const limiter = new CreditRateLimiter({ creditsPerMinute: 55 });
    await expect(limiter.acquire(56)).rejects.toThrow();
  });

  test('admits up to ceiling instantly within a single window', async () => {
    const limiter = new CreditRateLimiter({ creditsPerMinute: 55, windowMs: 60_000 });
    const t0 = Date.now();
    for (let i = 0; i < 55; i++) await limiter.acquire(1);
    expect(Date.now() - t0).toBeLessThan(50);
    expect(limiter.inflight()).toBe(55);
  });

  test('throttles the (ceiling+1)-th request until the window slides', async () => {
    const limiter = new CreditRateLimiter({ creditsPerMinute: 5, windowMs: 80 });
    for (let i = 0; i < 5; i++) await limiter.acquire(1);
    const t0 = Date.now();
    await limiter.acquire(1);
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(60);
    expect(limiter.inflight()).toBeLessThanOrEqual(5);
  });

  test('serialises concurrent acquires and never exceeds the ceiling at any point', async () => {
    const limiter = new CreditRateLimiter({ creditsPerMinute: 5, windowMs: 60 });
    let observedMax = 0;
    const tasks: Promise<void>[] = [];
    for (let i = 0; i < 12; i++) {
      tasks.push(
        limiter.acquire(1).then(() => {
          observedMax = Math.max(observedMax, limiter.inflight());
        }),
      );
    }
    await Promise.all(tasks);
    expect(observedMax).toBeLessThanOrEqual(5);
  });
});
