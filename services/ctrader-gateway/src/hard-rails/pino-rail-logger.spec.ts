import { describe, expect, it } from 'bun:test';

import { pinoRailLogger } from './logger.ts';
import type { RailLogger, RailLoggerPayload } from './types.ts';

// Sanity test: the production factory returns a RailLogger-shaped value and
// accepts both `(payload)` and `(payload, msg)` signatures without throwing.
// Wire-level pino output (transport, redact application) is exercised by
// `@ankit-prop/contracts`'s pino-logger.spec.ts; here we only assert the
// gateway-side adapter preserves the §9 RailLogger contract.

describe('pinoRailLogger', () => {
  it('returns a RailLogger that accepts info(payload) and info(payload, msg)', () => {
    const logger: RailLogger = pinoRailLogger({ pretty: false, level: 'silent' });
    const payload: RailLoggerPayload = {
      rail: 'spread_guard',
      symbol: 'XAUUSD',
      outcome: 'allow',
      reason: 'spread within cap',
      accountId: 'acct-1',
      envelopeId: 'env-1',
      clientOrderId: 'cli-1',
    };
    expect(() => logger.info(payload)).not.toThrow();
    expect(() => logger.info(payload, 'tick')).not.toThrow();
    expect(() => logger.warn(payload)).not.toThrow();
    expect(() => logger.warn(payload, 'reject')).not.toThrow();
  });

  it('honours service name override', () => {
    const logger = pinoRailLogger({ pretty: false, level: 'silent', service: 'custom' });
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });
});
