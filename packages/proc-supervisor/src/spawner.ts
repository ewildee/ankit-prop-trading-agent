export interface SpawnHandle {
  pid: number;
  exited: Promise<{ code: number | null; signaled: boolean }>;
  kill: (signal: NodeJS.Signals) => boolean;
}

export interface SpawnOptions {
  cmd: string[];
  cwd?: string;
  env?: Record<string, string>;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface ProcSpawner {
  spawn: (opts: SpawnOptions) => SpawnHandle;
}

async function pump(
  stream: ReadableStream<Uint8Array> | undefined | null,
  on?: (chunk: string) => void,
): Promise<void> {
  if (!stream || !on) return;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) on(decoder.decode(value, { stream: true }));
  }
  const tail = decoder.decode();
  if (tail) on(tail);
}

export const realSpawner: ProcSpawner = {
  spawn(opts) {
    const sub = Bun.spawn(opts.cmd, {
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (opts.onStdout) void pump(sub.stdout as ReadableStream<Uint8Array>, opts.onStdout);
    if (opts.onStderr) void pump(sub.stderr as ReadableStream<Uint8Array>, opts.onStderr);

    const exited = sub.exited.then(
      (code: number | null) => ({ code, signaled: sub.signalCode != null }),
      (_err: unknown) => ({ code: null as number | null, signaled: true }),
    );
    return {
      pid: sub.pid,
      exited,
      kill: (signal) => {
        try {
          sub.kill(signal);
          return true;
        } catch {
          return false;
        }
      },
    };
  },
};
