export interface FindProcAdapter {
  findByPort: (port: number) => Promise<number[]>;
  kill: (pid: number, signal: NodeJS.Signals) => boolean;
  isAlive: (pid: number) => boolean;
}

async function readAll(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return '';
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

export const realFindProc: FindProcAdapter = {
  async findByPort(port) {
    const proc = Bun.spawn(['lsof', `-tiTCP:${port}`, '-sTCP:LISTEN'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const text = await readAll(proc.stdout);
    await proc.exited;
    return text
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => /^[0-9]+$/.test(s))
      .map((s) => Number.parseInt(s, 10));
  },
  kill(pid, signal) {
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  },
  isAlive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
};

export class FakeFindProc implements FindProcAdapter {
  private readonly portMap = new Map<number, Set<number>>();
  private readonly alive = new Set<number>();
  public readonly killCalls: Array<{ pid: number; signal: NodeJS.Signals }> = [];

  setPortOwner(port: number, pids: number[]): void {
    this.portMap.set(port, new Set(pids));
    for (const p of pids) this.alive.add(p);
  }
  clearPort(port: number): void {
    this.portMap.delete(port);
  }
  markDead(pid: number): void {
    this.alive.delete(pid);
    for (const set of this.portMap.values()) set.delete(pid);
  }
  async findByPort(port: number): Promise<number[]> {
    return [...(this.portMap.get(port) ?? [])];
  }
  kill(pid: number, signal: NodeJS.Signals): boolean {
    this.killCalls.push({ pid, signal });
    if (!this.alive.has(pid)) return false;
    if (signal === 'SIGKILL' || signal === 'SIGTERM' || signal === 'SIGINT') {
      this.markDead(pid);
    }
    return true;
  }
  isAlive(pid: number): boolean {
    return this.alive.has(pid);
  }
}
