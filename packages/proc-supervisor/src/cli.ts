import pkg from '../package.json' with { type: 'json' };
import { loadConfigFromFile } from './config-loader.ts';
import { Supervisor } from './supervisor.ts';
import { consoleLogger } from './types.ts';

const SUPERVISOR_VERSION: string = pkg.version;

function usage(): string {
  return [
    'proc-supervisor — process tree lifecycle manager (BLUEPRINT §3, §17, §22 phase 1)',
    '',
    'usage: proc-supervisor <command> [options]',
    '',
    'commands:',
    '  start [--config=<path>]    Boot all services in topo order; serve aggregated /health',
    '  stop  [--port=<n>]         Tell a running supervisor to shut down (HTTP DELETE /supervisor)',
    '  status [--port=<n>]        Print aggregated /health JSON',
    '  restart <service> [--port=<n>]   Restart a single service via /services/<name>/restart',
    '  logs <service> [--port=<n>]      Print recent log buffer for a service',
    '  --version                  Print supervisor version',
    '',
  ].join('\n');
}

interface Parsed {
  positional: string[];
  flags: Record<string, string>;
}

function parseArgs(argv: string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq === -1) flags[a.slice(2)] = 'true';
      else flags[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function defaultConfigPath(): string {
  return Bun.env.SUPERVISOR_CONFIG ?? 'config/supervisor.config.yaml';
}

function defaultPort(): number {
  return Number.parseInt(Bun.env.SUPERVISOR_PORT ?? '9100', 10);
}

async function cmdStart(flags: Record<string, string>): Promise<number> {
  const configPath = flags.config ?? defaultConfigPath();
  const cfg = await loadConfigFromFile(configPath);
  let shuttingDown = false;
  const stop = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    consoleLogger.info('supervisor.signal.received', { signal });
    await sup.stop();
    process.exit(0);
  };
  const sup = new Supervisor({
    cfg,
    supervisorVersion: SUPERVISOR_VERSION,
    logger: consoleLogger,
    onShutdownRequested: () => {
      void stop('http-DELETE-/supervisor');
    },
  });

  process.on('SIGTERM', () => {
    void stop('SIGTERM');
  });
  process.on('SIGINT', () => {
    void stop('SIGINT');
  });

  try {
    await sup.start();
    consoleLogger.info('supervisor.ready', {
      version: SUPERVISOR_VERSION,
      port: cfg.port,
      services: cfg.services.map((s) => s.name),
    });
  } catch (err) {
    consoleLogger.error('supervisor.start.failed', { error: (err as Error).message });
    await sup.stop();
    return 1;
  }
  await new Promise<void>(() => {});
  return 0;
}

async function cmdStatus(flags: Record<string, string>): Promise<number> {
  const port = flags.port ? Number.parseInt(flags.port, 10) : defaultPort();
  const res = await fetch(`http://127.0.0.1:${port}/health`);
  const text = await res.text();
  console.log(text);
  return res.ok ? 0 : 1;
}

async function cmdStop(flags: Record<string, string>): Promise<number> {
  const port = flags.port ? Number.parseInt(flags.port, 10) : defaultPort();
  const res = await fetch(`http://127.0.0.1:${port}/supervisor`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    console.error(`stop failed: HTTP ${res.status}`);
    return 1;
  }
  console.log('stop signal sent');
  return 0;
}

async function cmdRestart(positional: string[], flags: Record<string, string>): Promise<number> {
  const name = positional[0];
  if (!name) {
    console.error('usage: proc-supervisor restart <service>');
    return 2;
  }
  const port = flags.port ? Number.parseInt(flags.port, 10) : defaultPort();
  const res = await fetch(`http://127.0.0.1:${port}/services/${encodeURIComponent(name)}/restart`, {
    method: 'POST',
  });
  console.log(await res.text());
  return res.ok ? 0 : 1;
}

async function cmdLogs(positional: string[], flags: Record<string, string>): Promise<number> {
  const name = positional[0];
  if (!name) {
    console.error('usage: proc-supervisor logs <service>');
    return 2;
  }
  const port = flags.port ? Number.parseInt(flags.port, 10) : defaultPort();
  const res = await fetch(`http://127.0.0.1:${port}/services/${encodeURIComponent(name)}/logs`);
  console.log(await res.text());
  return res.ok ? 0 : 1;
}

export async function main(argv: string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv);
  if (flags.version === 'true') {
    console.log(SUPERVISOR_VERSION);
    return 0;
  }
  const cmd = positional[0];
  if (!cmd || cmd === 'help' || flags.help === 'true') {
    console.log(usage());
    return cmd ? 0 : 2;
  }
  switch (cmd) {
    case 'start':
      return cmdStart(flags);
    case 'stop':
      return cmdStop(flags);
    case 'status':
      return cmdStatus(flags);
    case 'restart':
      return cmdRestart(positional.slice(1), flags);
    case 'logs':
      return cmdLogs(positional.slice(1), flags);
    default:
      console.error(`unknown command: ${cmd}\n\n${usage()}`);
      return 2;
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error((err as Error).stack ?? String(err));
      process.exit(1);
    },
  );
}
