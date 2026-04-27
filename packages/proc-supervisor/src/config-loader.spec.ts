import { describe, expect, test } from 'bun:test';
import { parseConfig } from './config-loader.ts';

const VALID = `
mode: dev
port: 9100
services:
  - name: news
    cmd: bun run --cwd services/news start
    port: 9203
    onExisting: refuse
    health:
      url: http://localhost:9203/health
      timeoutMs: 30000
    restart:
      policy: on-failure
      maxCrashes: 3
      windowMs: 300000

  - name: ctrader-gateway
    cmd: bun run --cwd services/ctrader-gateway start
    port: 9201
    health:
      url: http://localhost:9201/health
    restart:
      policy: on-failure
      maxCrashes: 3
      windowMs: 300000

  - name: trader
    cmd: bun run --cwd services/trader start
    port: 9202
    dependsOn: [ctrader-gateway, news]
    health:
      url: http://localhost:9202/health
    shutdown:
      timeoutMs: 30000
`;

describe('parseConfig', () => {
  test('parses a BLUEPRINT §17.2 example', () => {
    const cfg = parseConfig(VALID);
    expect(cfg.services.map((s) => s.name)).toEqual(['news', 'ctrader-gateway', 'trader']);
    expect(cfg.port).toBe(9100);
    const trader = cfg.services.find((s) => s.name === 'trader');
    expect(trader?.dependsOn).toEqual(['ctrader-gateway', 'news']);
    expect(trader?.shutdown.timeoutMs).toBe(30000);
  });

  test('applies sane defaults when optional fields are missing', () => {
    const cfg = parseConfig(`
mode: dev
services:
  - name: a
    cmd: bun run a.ts
    health:
      url: http://localhost:9001/health
`);
    expect(cfg.port).toBe(9100);
    expect(cfg.services[0]?.onExisting).toBe('refuse');
    expect(cfg.services[0]?.restart.maxCrashes).toBe(3);
    expect(cfg.services[0]?.restart.windowMs).toBe(300_000);
    expect(cfg.services[0]?.shutdown.timeoutMs).toBe(10_000);
  });

  test('rejects invalid YAML', () => {
    expect(() => parseConfig('this: is: not: valid')).toThrow();
  });

  test('rejects unknown dependsOn target', () => {
    expect(() =>
      parseConfig(`
services:
  - name: a
    cmd: bun run a.ts
    dependsOn: [b]
    health: { url: http://localhost:1/health }
`),
    ).toThrow(/unknown/i);
  });

  test('rejects services with no commands or args', () => {
    expect(() =>
      parseConfig(`
services:
  - name: a
    health: { url: http://localhost:1/health }
    extra: 1
`),
    ).toThrow();
  });

  test('rejects empty services list', () => {
    expect(() =>
      parseConfig(`
services: []
`),
    ).toThrow();
  });
});
