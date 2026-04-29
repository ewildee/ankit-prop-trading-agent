import { loadVersionFromPkgJson } from '@ankit-prop/contracts';
import pkg from '../package.json' with { type: 'json' };

export * from './fetcher/index.ts';
export * from './freshness/index.ts';
export type { HealthApp as App } from './health/index.ts';
export * from './health/index.ts';

export const NEWS_SERVICE_VERSION = loadVersionFromPkgJson(pkg);
