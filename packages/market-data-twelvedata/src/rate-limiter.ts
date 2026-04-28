export type RateLimiterCfg = {
  creditsPerMinute: number;
  windowMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export class CreditRateLimiter {
  private readonly creditsPerMinute: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly stamps: number[] = [];
  private chain: Promise<void> = Promise.resolve();

  constructor(cfg: RateLimiterCfg) {
    if (cfg.creditsPerMinute <= 0) {
      throw new Error('creditsPerMinute must be > 0');
    }
    this.creditsPerMinute = cfg.creditsPerMinute;
    this.windowMs = cfg.windowMs ?? 60_000;
    this.now = cfg.now ?? (() => Date.now());
    this.sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  acquire(credits = 1): Promise<void> {
    if (credits <= 0) return Promise.resolve();
    if (credits > this.creditsPerMinute) {
      return Promise.reject(
        new Error(`single request costs ${credits} > limit ${this.creditsPerMinute}`),
      );
    }
    const next = this.chain.then(() => this.acquireSerialized(credits));
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async acquireSerialized(credits: number): Promise<void> {
    while (true) {
      const t = this.now();
      const cutoff = t - this.windowMs;
      while (this.stamps.length > 0 && this.stamps[0]! <= cutoff) {
        this.stamps.shift();
      }
      if (this.stamps.length + credits <= this.creditsPerMinute) {
        for (let i = 0; i < credits; i++) this.stamps.push(t);
        return;
      }
      const oldest = this.stamps[0]!;
      const waitMs = Math.max(1, oldest + this.windowMs - t + 1);
      await this.sleep(waitMs);
    }
  }

  inflight(): number {
    const cutoff = this.now() - this.windowMs;
    while (this.stamps.length > 0 && this.stamps[0]! <= cutoff) {
      this.stamps.shift();
    }
    return this.stamps.length;
  }
}
