import { z } from 'zod';

export const HealthCfg = z.strictObject({
  url: z.string().url(),
  timeoutMs: z.number().int().positive().default(30_000),
  runningPollIntervalMs: z.number().int().positive().default(5_000),
  startupPollIntervalMs: z.number().int().positive().default(500),
  expectStatus: z.enum(['healthy', 'degraded']).default('healthy'),
});
export type HealthCfg = z.infer<typeof HealthCfg>;

export const RestartCfg = z.strictObject({
  policy: z.enum(['on-failure', 'always', 'never']).default('on-failure'),
  maxCrashes: z.number().int().positive().default(3),
  windowMs: z.number().int().positive().default(300_000),
  baseDelayMs: z.number().int().nonnegative().default(500),
  maxDelayMs: z.number().int().positive().default(30_000),
});
export type RestartCfg = z.infer<typeof RestartCfg>;

export const ShutdownCfg = z.strictObject({
  timeoutMs: z.number().int().positive().default(10_000),
  signal: z.enum(['SIGTERM', 'SIGINT']).default('SIGTERM'),
});
export type ShutdownCfg = z.infer<typeof ShutdownCfg>;

export const ServiceCfg = z.strictObject({
  name: z.string().min(1),
  cmd: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  port: z.number().int().positive().optional(),
  onExisting: z.enum(['adopt', 'replace', 'refuse']).default('refuse'),
  health: HealthCfg,
  restart: RestartCfg.default(() => RestartCfg.parse({})),
  shutdown: ShutdownCfg.default(() => ShutdownCfg.parse({})),
  dependsOn: z.array(z.string()).default([]),
});
export type ServiceCfg = z.infer<typeof ServiceCfg>;

export const SupervisorCfg = z
  .object({
    mode: z.enum(['dev', 'prod']).default('dev'),
    port: z.number().int().positive().default(9100),
    services: z.array(ServiceCfg).min(1),
  })
  .loose();
export type SupervisorCfg = z.infer<typeof SupervisorCfg>;

export interface SupervisorLogger {
  info: (event: string, fields?: Record<string, unknown>) => void;
  warn: (event: string, fields?: Record<string, unknown>) => void;
  error: (event: string, fields?: Record<string, unknown>) => void;
  debug: (event: string, fields?: Record<string, unknown>) => void;
}

export const consoleLogger: SupervisorLogger = {
  info: (event, fields) => {
    console.log(JSON.stringify({ level: 'info', event, ...fields }));
  },
  warn: (event, fields) => {
    console.warn(JSON.stringify({ level: 'warn', event, ...fields }));
  },
  error: (event, fields) => {
    console.error(JSON.stringify({ level: 'error', event, ...fields }));
  },
  debug: (event, fields) => {
    if (Bun.env.SUPERVISOR_DEBUG === '1') {
      console.log(JSON.stringify({ level: 'debug', event, ...fields }));
    }
  },
};

export const silentLogger: SupervisorLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};
