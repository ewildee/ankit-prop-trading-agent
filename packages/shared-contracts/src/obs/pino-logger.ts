// Canonical structured logger factory for the umbrella (BLUEPRINT §20.1).
//
// Returns a pino instance preconfigured with the §23.6 redact list and the
// dev-vs-prod transport switch. All services and packages should use this
// factory rather than constructing pino directly so the redact set, level
// keys, and output transport stay aligned across the monorepo.
//
// The returned `Logger` matches the `(payload, msg?)` shape used by every
// `*Logger` interface in the project (e.g. `RailLogger` in
// `services/ctrader-gateway/src/hard-rails/types.ts`), which itself mirrors
// pino's own signature — so adapters that type-narrow the return value to a
// project-local interface stay zero-overhead.

import pino, { type Logger, type LoggerOptions } from 'pino';

// §23.6: pino redact list must cover BROKER_CREDS_*, OPENROUTER_API_KEY,
// *token*, *secret*. Pino redact uses JSONPath-style keys with `*` matching a
// single segment, so we enumerate the BROKER_CREDS_* axis explicitly and use
// `*.token` / `*.secret` / `*.password` for nested payload fields. Adding new
// secret fields belongs here so every service inherits the rule.
export const DEFAULT_REDACT_PATHS = [
  'OPENROUTER_API_KEY',
  'BROKER_CREDS_HOST',
  'BROKER_CREDS_USER',
  'BROKER_CREDS_PASS',
  'BROKER_CREDS_REFRESH_TOKEN',
  'token',
  'refreshToken',
  'accessToken',
  'secret',
  'apiKey',
  'password',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.secret',
  '*.apiKey',
  '*.password',
] as const;

export interface CreatePinoLoggerOptions {
  // Service name stamped onto every record (BLUEPRINT §20.1).
  readonly service: string;
  // Force pretty output regardless of NODE_ENV. Defaults to dev-only.
  readonly pretty?: boolean;
  // Override the default redact list. Most callers should pass extra entries
  // via `extraRedactPaths` instead so the §23.6 baseline is preserved.
  readonly redactPaths?: readonly string[];
  readonly extraRedactPaths?: readonly string[];
  // Default level (`info`); set to `silent` for tests that care only about
  // shape, not IO.
  readonly level?: LoggerOptions['level'];
  // Static fields merged onto every record (e.g. `{ instance_id }`).
  readonly base?: Readonly<Record<string, unknown>>;
}

export function createPinoLogger(opts: CreatePinoLoggerOptions): Logger {
  const isDev = opts.pretty ?? process.env.NODE_ENV !== 'production';
  const redactPaths = opts.redactPaths ?? [
    ...DEFAULT_REDACT_PATHS,
    ...(opts.extraRedactPaths ?? []),
  ];

  const options: LoggerOptions = {
    level: opts.level ?? 'info',
    base: { service: opts.service, ...(opts.base ?? {}) },
    redact: { paths: [...redactPaths], censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (isDev) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
    });
  }

  return pino(options);
}

export type { Logger as PinoLogger } from 'pino';
