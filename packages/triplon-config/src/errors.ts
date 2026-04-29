export type ConfigPath = readonly (string | number)[];

export class ConfigLoadError extends Error {
  override readonly name = 'ConfigLoadError';
  readonly path: ConfigPath;
  readonly sourceFile: string;

  constructor(message: string, opts: { sourceFile: string; path?: ConfigPath; cause?: unknown }) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.sourceFile = opts.sourceFile;
    this.path = opts.path ?? [];
  }
}

export type ConfigErrorCode =
  | 'E_CONFIG_NOT_FOUND'
  | 'E_CONFIG_INVALID'
  | 'E_CONFIG_PARSE'
  | 'E_CONFIG_UNKNOWN';

const SENSITIVE_SUBSTRINGS = ['apikey', 'password', 'token', 'secret', 'bearer'];

function scrubValue(key: string, value: unknown): unknown {
  const lower = key.toLowerCase();
  if (SENSITIVE_SUBSTRINGS.some((substring) => lower.includes(substring))) {
    return typeof value === 'string' && value.length > 0 ? '[redacted]' : value;
  }
  return value;
}

function scrubDetails(details: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    out[key] = scrubValue(key, value);
  }
  return out;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
  readonly code: ConfigErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: ConfigErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = scrubDetails(details);
  }
}
