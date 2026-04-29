// Public surface of @ankit-prop/ctrader-gateway. Hard-rails subsystem
// (BLUEPRINT §9) is the Phase 2.3 deliverable; transport / OAuth / order
// manager land in ANKA-13 / ANKA-15.

export * from './hard-rails/index.ts';
export type { HealthApp as App, HealthServerOptions } from './health-server.ts';
export { buildHealthApp, startHealthServer } from './health-server.ts';
export type { DependencyState, HealthDeps } from './health-snapshot.ts';
export { buildHealthSnapshot } from './health-snapshot.ts';
