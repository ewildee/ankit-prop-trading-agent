export const SERVICE_KEYS = ['supervisor', 'gateway', 'trader', 'news', 'dashboard'] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

export interface ServiceRegistryEntry {
  readonly service: string;
  readonly port: number;
  readonly baseUrl: `http://${string}:${number}`;
  readonly healthPath: '/health';
}

export type ServiceRegistry = Record<ServiceKey, ServiceRegistryEntry>;

// BLUEPRINT §19 local defaults. Runtime overrides belong to @triplon/config,
// not to this static Treaty foundation.
export const SERVICES = {
  supervisor: {
    service: 'proc-supervisor',
    port: 9100,
    baseUrl: 'http://127.0.0.1:9100',
    healthPath: '/health',
  },
  gateway: {
    service: 'ctrader-gateway',
    port: 9201,
    baseUrl: 'http://127.0.0.1:9201',
    healthPath: '/health',
  },
  trader: {
    service: 'trader',
    port: 9202,
    baseUrl: 'http://127.0.0.1:9202',
    healthPath: '/health',
  },
  news: {
    service: 'news',
    port: 9203,
    baseUrl: 'http://127.0.0.1:9203',
    healthPath: '/health',
  },
  dashboard: {
    service: 'dashboard',
    port: 9204,
    baseUrl: 'http://127.0.0.1:9204',
    healthPath: '/health',
  },
} as const satisfies ServiceRegistry;
