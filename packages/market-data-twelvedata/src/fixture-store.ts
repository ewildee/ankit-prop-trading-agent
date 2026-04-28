import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  type AdversarialWindowsFile,
  AdversarialWindowsFileSchema,
  type BarLine,
  BarLineSchema,
  type Manifest,
  ManifestSchema,
  type ShardEntry,
  type SymbolMetaFile,
  SymbolMetaSchema,
} from './schema.ts';
import type { CanonicalSymbol } from './symbols.ts';
import type { Timeframe } from './timeframes.ts';

export type FixtureStoreCfg = {
  rootDir: string;
};

export class FixtureStore {
  constructor(private readonly cfg: FixtureStoreCfg) {}

  shardPath(symbol: CanonicalSymbol, tf: Timeframe): string {
    return join(this.cfg.rootDir, 'bars', symbol, `${tf}.jsonl.gz`);
  }

  symbolMetaPath(symbol: CanonicalSymbol): string {
    return join(this.cfg.rootDir, 'symbols', `${symbol}.meta.json`);
  }

  manifestPath(): string {
    return join(this.cfg.rootDir, 'manifest.json');
  }

  adversarialWindowsPath(): string {
    return join(this.cfg.rootDir, 'adversarial-windows.json');
  }

  fetchLogPath(): string {
    return join(this.cfg.rootDir, 'fetch-log.jsonl');
  }

  async readShardBars(symbol: CanonicalSymbol, tf: Timeframe): Promise<BarLine[]> {
    const file = Bun.file(this.shardPath(symbol, tf));
    if (!(await file.exists())) return [];
    const compressed = new Uint8Array(await file.arrayBuffer());
    if (compressed.length === 0) return [];
    const raw = Bun.gunzipSync(compressed);
    const text = new TextDecoder().decode(raw);
    const out: BarLine[] = [];
    for (const line of text.split('\n')) {
      if (!line) continue;
      const obj = JSON.parse(line) as BarLine;
      out.push(obj);
    }
    return out;
  }

  async writeShardBars(
    symbol: CanonicalSymbol,
    tf: Timeframe,
    bars: ReadonlyArray<BarLine>,
  ): Promise<ShardEntry> {
    const path = this.shardPath(symbol, tf);
    await ensureParent(path);
    const validated: BarLine[] = bars.map((b, i) => {
      const parsed = BarLineSchema.safeParse(b);
      if (!parsed.success) {
        throw new Error(
          `writeShardBars(${symbol}/${tf}) bar[${i}] failed schema validation: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    });
    const text = validated.map((b) => JSON.stringify(b)).join('\n');
    const buf = new TextEncoder().encode(text);
    const compressed = Bun.gzipSync(buf);
    await Bun.write(path, compressed);
    const sha256 = await sha256Hex(compressed);
    return {
      path: relPath(path, this.cfg.rootDir),
      symbol,
      timeframe: tf,
      barCount: bars.length,
      firstBarStart: bars.length > 0 ? bars[0]!.t : null,
      lastBarStart: bars.length > 0 ? bars[bars.length - 1]!.t : null,
      byteSizeCompressed: compressed.length,
      sha256,
    };
  }

  async writeSymbolMeta(meta: SymbolMetaFile): Promise<void> {
    const parsed = SymbolMetaSchema.parse(meta);
    const path = this.symbolMetaPath(parsed.symbol as CanonicalSymbol);
    await ensureParent(path);
    await Bun.write(path, JSON.stringify(parsed, null, 2));
  }

  async readSymbolMeta(symbol: CanonicalSymbol): Promise<SymbolMetaFile | null> {
    const file = Bun.file(this.symbolMetaPath(symbol));
    if (!(await file.exists())) return null;
    const json = await file.json();
    return SymbolMetaSchema.parse(json);
  }

  async writeManifest(manifest: Manifest): Promise<void> {
    const parsed = ManifestSchema.parse(manifest);
    await ensureParent(this.manifestPath());
    await Bun.write(this.manifestPath(), JSON.stringify(parsed, null, 2));
  }

  async readManifest(): Promise<Manifest | null> {
    const file = Bun.file(this.manifestPath());
    if (!(await file.exists())) return null;
    return ManifestSchema.parse(await file.json());
  }

  async writeAdversarialWindows(windows: AdversarialWindowsFile): Promise<void> {
    const parsed = AdversarialWindowsFileSchema.parse(windows);
    await ensureParent(this.adversarialWindowsPath());
    await Bun.write(this.adversarialWindowsPath(), JSON.stringify(parsed, null, 2));
  }

  async appendFetchLog(entry: Record<string, unknown>): Promise<void> {
    const path = this.fetchLogPath();
    await ensureParent(path);
    const file = Bun.file(path);
    const existing = (await file.exists()) ? await file.text() : '';
    await Bun.write(path, `${existing}${JSON.stringify(entry)}\n`);
  }

  rootDir(): string {
    return this.cfg.rootDir;
  }
}

async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

function relPath(absPath: string, root: string): string {
  if (absPath.startsWith(`${root}/`)) return absPath.slice(root.length + 1);
  if (absPath === root) return '';
  return absPath;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(bytes);
  return hasher.digest('hex');
}
