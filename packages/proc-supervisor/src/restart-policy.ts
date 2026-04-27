import type { RestartCfg } from './types.ts';

export type RestartDecision =
  | { kind: 'restart'; delayMs: number; crashesInWindow: number }
  | { kind: 'circuit-broken'; reason: string; crashesInWindow: number }
  | { kind: 'no-restart'; reason: string; crashesInWindow: number };

export class RestartPolicy {
  private readonly crashes: number[] = [];

  constructor(
    private readonly cfg: RestartCfg,
    private readonly now: () => number = Date.now,
  ) {}

  recordCrash(opts: { exitCode: number | null; signaled: boolean }): RestartDecision {
    const t = this.now();
    this.crashes.push(t);
    this.evict(t);
    const crashesInWindow = this.crashes.length;

    if (this.cfg.policy === 'never') {
      return { kind: 'no-restart', reason: 'policy=never', crashesInWindow };
    }

    if (this.cfg.policy === 'on-failure') {
      const isFailure = opts.signaled || (opts.exitCode !== null && opts.exitCode !== 0);
      if (!isFailure) {
        return {
          kind: 'no-restart',
          reason: `policy=on-failure, clean exit (code=${opts.exitCode ?? 'null'})`,
          crashesInWindow,
        };
      }
    }

    if (crashesInWindow > this.cfg.maxCrashes) {
      return {
        kind: 'circuit-broken',
        reason: `${crashesInWindow} crashes in ${this.cfg.windowMs}ms (max ${this.cfg.maxCrashes})`,
        crashesInWindow,
      };
    }

    const delayMs = this.computeDelay(crashesInWindow);
    return { kind: 'restart', delayMs, crashesInWindow };
  }

  recordCleanRestart(): void {
    this.crashes.length = 0;
  }

  crashesInWindow(): number {
    this.evict(this.now());
    return this.crashes.length;
  }

  private evict(t: number): void {
    const cutoff = t - this.cfg.windowMs;
    while (this.crashes.length > 0) {
      const head = this.crashes[0];
      if (head !== undefined && head < cutoff) this.crashes.shift();
      else break;
    }
  }

  private computeDelay(attempt: number): number {
    const delay = this.cfg.baseDelayMs * 2 ** Math.max(0, attempt - 1);
    return Math.min(delay, this.cfg.maxDelayMs);
  }
}
