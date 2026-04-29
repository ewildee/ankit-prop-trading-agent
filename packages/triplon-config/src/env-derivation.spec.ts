import { describe, expect, test } from 'bun:test';

import { deriveEnvName } from './env-derivation.ts';

describe('deriveEnvName', () => {
  test('derives SCREAMING_SNAKE names from config paths', () => {
    expect(deriveEnvName(['router', 'baseUrl'])).toBe('ROUTER_BASE_URL');
    expect(deriveEnvName(['models', 'crossCheck'])).toBe('MODELS_CROSS_CHECK');
    expect(deriveEnvName(['circuitBreaker', 'cooldownMs'])).toBe('CIRCUIT_BREAKER_COOLDOWN_MS');
  });

  test('preserves uppercase runs and applies prefixes', () => {
    expect(deriveEnvName(['baseURL'], 'ANKIT_')).toBe('ANKIT_BASE_URL');
    expect(deriveEnvName(['xmlAPIConfig'])).toBe('XML_API_CONFIG');
  });

  test('normalizes punctuation and numeric path segments', () => {
    expect(deriveEnvName(['broker.creds', 0, 'apiKey'])).toBe('BROKER_CREDS_0_API_KEY');
  });
});
