import { describe, expect, test } from 'bun:test';
import { SERVICE_KEYS, SERVICES } from './service-registry.ts';

describe('Treaty service registry', () => {
  test('pins BLUEPRINT §19 local service ports and health paths', () => {
    expect(SERVICE_KEYS).toEqual(['supervisor', 'gateway', 'trader', 'news', 'dashboard']);
    expect(SERVICES).toEqual({
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
    });
  });
});
