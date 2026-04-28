import { describe, expect, it } from 'bun:test';

import { createPinoLogger, DEFAULT_REDACT_PATHS } from './pino-logger.ts';

// Pino's `pretty: false` JSON output goes to stdout via the file-descriptor
// transport. For tests we just need to assert (a) the returned logger exposes
// the `(obj, msg?)` shape every project `*Logger` interface mirrors and (b)
// the redact list contains the §23.6 axes. Wire-level integration of the
// pretty transport is verified manually in dev; pinning the JSON output here
// would couple the test to pino's internal serialiser version and trip on
// every minor pino bump.

describe('createPinoLogger', () => {
  it('returns a logger that satisfies the (payload, msg?) shape used by RailLogger', () => {
    const logger = createPinoLogger({ service: 'test', pretty: false, level: 'silent' });
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    // Calling with the (obj, msg?) signature must not throw.
    logger.info({ rail: 'spread_guard', symbol: 'XAUUSD' }, 'tick');
    logger.warn({ rail: 'spread_guard', symbol: 'XAUUSD' });
  });

  it('stamps the service name onto every record via base', () => {
    const logger = createPinoLogger({ service: 'gateway', pretty: false, level: 'silent' });
    // pino exposes `bindings()` which returns the merged base object.
    expect(logger.bindings().service).toBe('gateway');
  });

  it('merges extra base fields without losing the service stamp', () => {
    const logger = createPinoLogger({
      service: 'trader',
      pretty: false,
      level: 'silent',
      base: { instance_id: 'inst-1' },
    });
    expect(logger.bindings()).toEqual({ service: 'trader', instance_id: 'inst-1' });
  });

  it('exposes a redact list that covers the §23.6 axes (BROKER_CREDS_*, OPENROUTER_API_KEY, *token*, *secret*)', () => {
    expect(DEFAULT_REDACT_PATHS).toContain('OPENROUTER_API_KEY');
    expect(DEFAULT_REDACT_PATHS).toContain('BROKER_CREDS_HOST');
    expect(DEFAULT_REDACT_PATHS).toContain('BROKER_CREDS_USER');
    expect(DEFAULT_REDACT_PATHS).toContain('BROKER_CREDS_PASS');
    expect(DEFAULT_REDACT_PATHS).toContain('BROKER_CREDS_REFRESH_TOKEN');
    expect(DEFAULT_REDACT_PATHS).toContain('token');
    expect(DEFAULT_REDACT_PATHS).toContain('secret');
    expect(DEFAULT_REDACT_PATHS).toContain('*.token');
    expect(DEFAULT_REDACT_PATHS).toContain('*.secret');
    expect(DEFAULT_REDACT_PATHS).toContain('*.refreshToken');
    expect(DEFAULT_REDACT_PATHS).toContain('*.accessToken');
  });

  it('honours an explicit `level: silent` override so tests do not write to stdout', () => {
    const logger = createPinoLogger({ service: 'silent-test', pretty: false, level: 'silent' });
    expect(logger.level).toBe('silent');
    expect(logger.isLevelEnabled('info')).toBe(false);
  });
});
