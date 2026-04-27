// Public surface of @ankit-prop/ctrader-gateway. Hard-rails subsystem
// (BLUEPRINT §9) is the Phase 2.3 deliverable; transport / OAuth / order
// manager land in ANKA-13 / ANKA-15.

export * from './hard-rails/index.ts';

export type { DependencyState, HealthDeps, HealthServerOptions } from './health-server.ts';
export { buildHealthSnapshot, startHealthServer } from './health-server.ts';
