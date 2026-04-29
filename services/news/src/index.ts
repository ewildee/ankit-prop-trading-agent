import { loadVersionFromPkgJson } from '@ankit-prop/contracts';
import pkg from '../package.json' with { type: 'json' };

export type { BuildNewsAppOptions, NewsApp as App } from './app.ts';
export { buildNewsApp } from './app.ts';
export * from './fetcher/index.ts';
export * from './freshness/index.ts';
export * from './health/index.ts';
export { metricsRoute, NewsMetrics } from './metrics.ts';
export type { CalendarRouteOptions, CalendarRoutesApp } from './routes/calendar.ts';
export { calendarRoutes } from './routes/calendar.ts';

export const NEWS_SERVICE_VERSION = loadVersionFromPkgJson(pkg);
