import { join } from 'node:path';

export const DASHBOARD_DIST_DIR = join(import.meta.dir, '..', 'dist');

export async function buildDashboardAssets(outdir = DASHBOARD_DIST_DIR): Promise<void> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, 'client', 'main.tsx')],
    outdir,
    target: 'browser',
    sourcemap: 'none',
    minify: false,
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
  });

  if (!result.success) {
    const messages = result.logs.map((log) => log.message).join('\n');
    throw new Error(`dashboard asset build failed\n${messages}`);
  }
}

if (import.meta.main) {
  await buildDashboardAssets();
}
