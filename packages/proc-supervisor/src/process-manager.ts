import type { HealthSnapshot, ServiceStatus, SupervisorServiceState } from '@ankit-prop/contracts';
import { type FindProcAdapter, realFindProc } from './findproc-adapter.ts';
import {
  type HealthFetcher,
  pollOnce,
  realHealthFetcher,
  waitUntilHealthy,
} from './health-poller.ts';
import { RestartPolicy } from './restart-policy.ts';
import { type ProcSpawner, realSpawner, type SpawnHandle } from './spawner.ts';
import { consoleLogger, type ServiceCfg, type SupervisorLogger } from './types.ts';

export interface ProcessManagerDeps {
  spawner?: ProcSpawner;
  findproc?: FindProcAdapter;
  fetcher?: HealthFetcher;
  logger?: SupervisorLogger;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface RingBuffer {
  push: (line: string) => void;
  snapshot: () => string[];
}
function ringBuffer(capacity: number): RingBuffer {
  const buf: string[] = [];
  return {
    push(line) {
      for (const part of line.split(/\r?\n/)) {
        if (part.length === 0) continue;
        buf.push(part);
        if (buf.length > capacity) buf.shift();
      }
    },
    snapshot: () => buf.slice(),
  };
}

export class ProcessManager {
  private state: SupervisorServiceState = 'idle';
  private handle: SpawnHandle | null = null;
  private adopted = false;
  private restartCount = 0;
  private startedAt: string | null = null;
  private health: HealthSnapshot | null = null;
  private lastExitCode: number | null = null;
  private lastError: string | null = null;
  private adoptedPid: number | null = null;
  private readonly policy: RestartPolicy;
  private healthLoopAbort: AbortController | null = null;
  private explicitStop = false;
  private readonly logs = ringBuffer(500);
  private readonly spawner: ProcSpawner;
  private readonly findproc: FindProcAdapter;
  private readonly fetcher: HealthFetcher;
  private readonly logger: SupervisorLogger;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    public readonly cfg: ServiceCfg,
    deps: ProcessManagerDeps = {},
  ) {
    this.spawner = deps.spawner ?? realSpawner;
    this.findproc = deps.findproc ?? realFindProc;
    this.fetcher = deps.fetcher ?? realHealthFetcher;
    this.logger = deps.logger ?? consoleLogger;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = deps.now ?? Date.now;
    this.policy = new RestartPolicy(cfg.restart, this.now);
  }

  getStatus(): ServiceStatus {
    return {
      name: this.cfg.name,
      state: this.state,
      pid: this.handle?.pid ?? this.adoptedPid,
      adopted: this.adopted,
      startedAt: this.startedAt,
      restartCount: this.restartCount,
      crashesInWindow: this.policy.crashesInWindow(),
      lastExitCode: this.lastExitCode,
      lastError: this.lastError,
      health: this.health,
    };
  }

  recentLogs(): string[] {
    return this.logs.snapshot();
  }

  async start(): Promise<void> {
    if (this.state === 'running' || this.state === 'starting' || this.state === 'adopted') {
      return;
    }
    this.state = 'starting';
    this.explicitStop = false;
    this.lastError = null;

    const existing =
      this.cfg.port !== undefined ? await this.findproc.findByPort(this.cfg.port) : [];
    if (existing.length > 0) {
      switch (this.cfg.onExisting) {
        case 'refuse': {
          this.state = 'idle';
          this.lastError = `refuse: port ${this.cfg.port} already in use by pid(s) ${existing.join(',')}`;
          throw new Error(this.lastError);
        }
        case 'adopt': {
          const adoptedPid = existing[0] ?? null;
          this.adoptedPid = adoptedPid;
          this.adopted = true;
          this.startedAt = new Date().toISOString();
          const probe = await pollOnce(this.cfg.health, this.fetcher);
          if (!probe.ok) {
            this.state = 'idle';
            this.lastError = `adopt: existing pid(s) ${existing.join(',')} failed health probe: ${probe.error}`;
            throw new Error(this.lastError);
          }
          this.health = probe.snapshot;
          this.state = 'adopted';
          this.startHealthLoop();
          this.logger.info('service.adopted', { service: this.cfg.name, pid: adoptedPid });
          return;
        }
        case 'replace': {
          this.logger.warn('service.replace.killing-existing', {
            service: this.cfg.name,
            pids: existing,
          });
          for (const pid of existing) this.findproc.kill(pid, 'SIGTERM');
          await this.waitUntilPortFree(this.cfg.port as number, this.cfg.shutdown.timeoutMs);
          const stillThere = await this.findproc.findByPort(this.cfg.port as number);
          if (stillThere.length > 0) {
            for (const pid of stillThere) this.findproc.kill(pid, 'SIGKILL');
            await this.waitUntilPortFree(this.cfg.port as number, 2000);
          }
          break;
        }
      }
    }

    await this.spawnAndWait();
  }

  async stop(): Promise<void> {
    this.explicitStop = true;
    this.healthLoopAbort?.abort();
    if (this.state === 'idle' || this.state === 'stopped' || this.state === 'circuit-broken')
      return;

    if (this.adopted) {
      this.state = 'stopped';
      this.adopted = false;
      this.adoptedPid = null;
      this.handle = null;
      return;
    }

    if (!this.handle) {
      this.state = 'stopped';
      return;
    }

    this.state = 'stopping';
    const handle = this.handle;
    handle.kill(this.cfg.shutdown.signal);

    const result = await Promise.race([
      handle.exited.then((r) => ({ kind: 'exited' as const, ...r })),
      this.sleep(this.cfg.shutdown.timeoutMs).then(() => ({ kind: 'timeout' as const })),
    ]);

    if (result.kind === 'timeout') {
      this.logger.warn('service.stop.timeout-sigkill', {
        service: this.cfg.name,
        timeoutMs: this.cfg.shutdown.timeoutMs,
      });
      handle.kill('SIGKILL');
      await handle.exited;
    } else {
      this.lastExitCode = result.code;
    }
    this.handle = null;
    this.state = 'stopped';
    this.health = null;
  }

  async restart(): Promise<void> {
    await this.stop();
    this.policy.recordCleanRestart();
    await this.start();
  }

  resetCircuit(): void {
    if (this.state === 'circuit-broken') {
      this.state = 'idle';
      this.policy.recordCleanRestart();
      this.lastError = null;
    }
  }

  private async spawnAndWait(): Promise<void> {
    const cmd = this.resolveCmd();
    this.startedAt = new Date().toISOString();
    this.handle = this.spawner.spawn({
      cmd,
      ...(this.cfg.cwd ? { cwd: this.cfg.cwd } : {}),
      ...(this.cfg.env ? { env: this.cfg.env } : {}),
      onStdout: (chunk) => this.logs.push(chunk),
      onStderr: (chunk) => this.logs.push(chunk),
    });
    this.adopted = false;
    this.adoptedPid = null;
    this.logger.info('service.spawned', {
      service: this.cfg.name,
      pid: this.handle.pid,
      cmd: cmd.join(' '),
    });

    const deadline = this.now() + this.cfg.health.timeoutMs;
    const r = await waitUntilHealthy(this.cfg.health, {
      deadline,
      fetcher: this.fetcher,
      sleep: this.sleep,
    });
    if (!r.ok) {
      this.lastError = `health timeout: ${r.error}`;
      this.handle.kill('SIGKILL');
      await this.handle.exited;
      this.handle = null;
      this.state = 'crashed';
      throw new Error(`service ${this.cfg.name} failed to become healthy: ${r.error}`);
    }
    this.health = r.snapshot;
    this.state = 'running';
    this.startHealthLoop();
    this.attachExitWatcher();
  }

  private attachExitWatcher(): void {
    if (!this.handle) return;
    const handle = this.handle;
    void handle.exited.then(async (res) => {
      if (this.handle !== handle) return;
      this.lastExitCode = res.code;
      this.handle = null;
      this.healthLoopAbort?.abort();
      this.health = null;

      if (this.explicitStop) {
        this.state = 'stopped';
        return;
      }

      this.logger.warn('service.exited.unexpected', {
        service: this.cfg.name,
        code: res.code,
        signaled: res.signaled,
      });

      const decision = this.policy.recordCrash({ exitCode: res.code, signaled: res.signaled });
      if (decision.kind === 'no-restart') {
        this.state = 'stopped';
        this.lastError = decision.reason;
        return;
      }
      if (decision.kind === 'circuit-broken') {
        this.state = 'circuit-broken';
        this.lastError = decision.reason;
        this.logger.error('service.circuit-broken', {
          service: this.cfg.name,
          reason: decision.reason,
        });
        return;
      }

      this.state = 'crashed';
      await this.sleep(decision.delayMs);
      if (this.explicitStop) {
        this.state = 'stopped';
        return;
      }
      this.restartCount += 1;
      try {
        await this.spawnAndWait();
      } catch (err) {
        this.lastError = (err as Error).message;
      }
    });
  }

  private startHealthLoop(): void {
    this.healthLoopAbort?.abort();
    const ctrl = new AbortController();
    this.healthLoopAbort = ctrl;
    void (async () => {
      while (!ctrl.signal.aborted) {
        await this.sleep(this.cfg.health.runningPollIntervalMs);
        if (ctrl.signal.aborted) break;
        const r = await pollOnce(this.cfg.health, this.fetcher);
        if (r.ok) {
          this.health = r.snapshot;
          if (this.state === 'unhealthy') this.state = this.adopted ? 'adopted' : 'running';
        } else {
          this.lastError = r.error;
          if (this.state === 'running' || this.state === 'adopted') this.state = 'unhealthy';
        }
      }
    })();
  }

  private async waitUntilPortFree(port: number, timeoutMs: number): Promise<void> {
    const deadline = this.now() + timeoutMs;
    while (this.now() < deadline) {
      const occ = await this.findproc.findByPort(port);
      if (occ.length === 0) return;
      await this.sleep(100);
    }
  }

  private resolveCmd(): string[] {
    if (this.cfg.args && this.cfg.args.length > 0) return this.cfg.args;
    if (!this.cfg.cmd) {
      throw new Error(`service ${this.cfg.name}: must define cmd or args`);
    }
    return this.cfg.cmd.split(/\s+/).filter((s) => s.length > 0);
  }
}
