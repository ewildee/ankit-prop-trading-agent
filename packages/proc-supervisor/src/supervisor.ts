import { startAggregatedHealthServer } from './aggregated-health.ts';

type BunServer = ReturnType<typeof Bun.serve>;

import { type FindProcAdapter, realFindProc } from './findproc-adapter.ts';
import { type HealthFetcher, realHealthFetcher } from './health-poller.ts';
import { ProcessManager } from './process-manager.ts';
import { type ProcSpawner, realSpawner } from './spawner.ts';
import { reverseTopoOrder, topoSort } from './topo-sort.ts';
import { consoleLogger, type SupervisorCfg, type SupervisorLogger } from './types.ts';

export interface SupervisorDeps {
  cfg: SupervisorCfg;
  supervisorVersion: string;
  spawner?: ProcSpawner;
  findproc?: FindProcAdapter;
  fetcher?: HealthFetcher;
  logger?: SupervisorLogger;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  startHealthServer?: boolean;
  onShutdownRequested?: () => void;
}

export class Supervisor {
  private readonly managers = new Map<string, ProcessManager>();
  private healthServer: BunServer | null = null;
  private readonly logger: SupervisorLogger;
  private readonly startedAt: number;
  private started = false;

  constructor(private readonly deps: SupervisorDeps) {
    this.logger = deps.logger ?? consoleLogger;
    this.startedAt = (deps.now ?? Date.now)();
    for (const svc of deps.cfg.services) {
      this.managers.set(
        svc.name,
        new ProcessManager(svc, {
          spawner: deps.spawner ?? realSpawner,
          findproc: deps.findproc ?? realFindProc,
          fetcher: deps.fetcher ?? realHealthFetcher,
          logger: this.logger,
          ...(deps.sleep ? { sleep: deps.sleep } : {}),
          ...(deps.now ? { now: deps.now } : {}),
        }),
      );
    }
  }

  managerList(): ProcessManager[] {
    return [...this.managers.values()];
  }

  manager(name: string): ProcessManager {
    const m = this.managers.get(name);
    if (!m) throw new Error(`unknown service: ${name}`);
    return m;
  }

  async start(): Promise<void> {
    if (this.started) return;
    const { waves } = topoSort(this.deps.cfg.services);
    for (const wave of waves) {
      await Promise.all(
        wave.map(async (svc) => {
          const m = this.managers.get(svc.name);
          if (!m) return;
          try {
            await m.start();
          } catch (err) {
            this.logger.error('service.start.failed', {
              service: svc.name,
              error: (err as Error).message,
            });
            throw err;
          }
        }),
      );
    }
    if (this.deps.startHealthServer !== false) {
      this.healthServer = startAggregatedHealthServer({
        managers: () => this.managerList(),
        cfg: this.deps.cfg,
        supervisorVersion: this.deps.supervisorVersion,
        startedAt: this.startedAt,
        ...(this.deps.now ? { now: this.deps.now } : {}),
        ...(this.deps.onShutdownRequested
          ? { onShutdownRequested: this.deps.onShutdownRequested }
          : {}),
      });
    }
    this.started = true;
  }

  async stop(): Promise<void> {
    const order = reverseTopoOrder(this.deps.cfg.services);
    for (const svc of order) {
      const m = this.managers.get(svc.name);
      if (!m) continue;
      try {
        await m.stop();
      } catch (err) {
        this.logger.error('service.stop.failed', {
          service: svc.name,
          error: (err as Error).message,
        });
      }
    }
    if (this.healthServer) {
      this.healthServer.stop(true);
      this.healthServer = null;
    }
    this.started = false;
  }
}
