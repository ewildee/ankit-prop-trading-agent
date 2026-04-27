import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RefreshTokenStore } from '../src/secret-store.ts';
import { runSmoke } from './runner.ts';

const VALID_KEY = 'a'.repeat(64);
const FROZEN = () => 1_000_000;

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'ankit-smoke-'));
}

describe('runSmoke', () => {
  test('with no creds: every step is skipped, verdict = gated', async () => {
    const r = await runSmoke({ env: {}, clock: FROZEN });
    expect(r.verdict).toBe('gated');
    expect(r.steps.length).toBe(7);
    expect(r.steps[0]?.id).toBe('app-auth');
    expect(r.steps[0]?.outcome).toBe('skipped-no-creds');
    expect(r.steps[0]?.stepNumber).toBe(1);
    expect(r.steps[6]?.id).toBe('protobuf-coverage');
    expect(r.steps[6]?.stepNumber).toBe(7);
  });

  test('with creds but no refresh token: app-auth not-implemented, account-auth skipped-needs-oauth', async () => {
    const root = tempRoot();
    try {
      const r = await runSmoke({
        env: {
          CTRADER_CLIENT_ID: 'cid',
          CTRADER_CLIENT_SECRET: 'csec',
          CTRADER_REDIRECT_URI: 'http://127.0.0.1:9210/oauth/callback',
          BROKER_ACCT_FTMO_TRIAL_1: '17101520',
          SECRETS_ENCRYPTION_KEY: VALID_KEY,
        },
        secretsRootDir: root,
        clock: FROZEN,
      });
      expect(r.verdict).toBe('gated');
      expect(r.accountId).toBe('17101520');
      expect(r.steps[0]?.outcome).toBe('not-implemented');
      expect(r.steps[1]?.outcome).toBe('skipped-needs-oauth');
      expect(r.steps[1]?.evidence).toMatchObject({ accountId: '17101520' });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('with creds and a seeded refresh token: account-auth becomes not-implemented (transport pending)', async () => {
    const root = tempRoot();
    try {
      const store = new RefreshTokenStore({ rootDir: root, encryptionKeyHex: VALID_KEY });
      await store.save('17101520', 'demo-refresh-token');
      const r = await runSmoke({
        env: {
          CTRADER_CLIENT_ID: 'cid',
          CTRADER_CLIENT_SECRET: 'csec',
          CTRADER_REDIRECT_URI: 'http://127.0.0.1:9210/oauth/callback',
          BROKER_ACCT_FTMO_TRIAL_1: '17101520',
          SECRETS_ENCRYPTION_KEY: VALID_KEY,
        },
        secretsRootDir: root,
        clock: FROZEN,
      });
      expect(r.steps[1]?.outcome).toBe('not-implemented');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('partial creds: app-auth still skipped-no-creds and missing list is reported', async () => {
    const r = await runSmoke({
      env: { CTRADER_CLIENT_ID: 'cid' },
      clock: FROZEN,
    });
    expect(r.steps[0]?.outcome).toBe('skipped-no-creds');
    const missing = (r.steps[0]?.evidence as { missing: string[] }).missing;
    expect(missing).toContain('CTRADER_CLIENT_SECRET');
    expect(missing).toContain('SECRETS_ENCRYPTION_KEY');
    expect(missing).not.toContain('CTRADER_CLIENT_ID');
  });
});
