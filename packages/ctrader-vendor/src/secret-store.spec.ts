import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DecryptError,
  decryptToString,
  encryptString,
  importAesKey,
  RefreshTokenStore,
  SecretStoreError,
} from './secret-store.ts';

const VALID_KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'ankit-secret-store-'));
}

describe('importAesKey', () => {
  test('rejects keys that are not 64 hex chars', async () => {
    await expect(importAesKey('a'.repeat(63))).rejects.toBeInstanceOf(SecretStoreError);
    await expect(importAesKey('a'.repeat(65))).rejects.toBeInstanceOf(SecretStoreError);
    await expect(importAesKey('z'.repeat(64))).rejects.toBeInstanceOf(SecretStoreError);
  });

  test('imports a valid 32-byte hex key', async () => {
    const k = await importAesKey(VALID_KEY);
    expect(k.algorithm).toMatchObject({ name: 'AES-GCM' });
  });
});

describe('encrypt/decrypt round-trip', () => {
  test('encrypts then decrypts to the same plaintext', async () => {
    const key = await importAesKey(VALID_KEY);
    const blob = await encryptString(key, 'refresh_token_payload_123');
    expect(blob.length).toBeGreaterThan(12);
    const back = await decryptToString(key, blob);
    expect(back).toBe('refresh_token_payload_123');
  });

  test('two encryptions of the same plaintext differ (random IV)', async () => {
    const key = await importAesKey(VALID_KEY);
    const a = await encryptString(key, 'same');
    const b = await encryptString(key, 'same');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  test('wrong key fails with DecryptError', async () => {
    const k1 = await importAesKey(VALID_KEY);
    const k2 = await importAesKey(OTHER_KEY);
    const blob = await encryptString(k1, 'abc');
    await expect(decryptToString(k2, blob)).rejects.toBeInstanceOf(DecryptError);
  });

  test('flipped ciphertext byte fails with DecryptError', async () => {
    const key = await importAesKey(VALID_KEY);
    const blob = await encryptString(key, 'abc');
    const lastIdx = blob.length - 1;
    const last = blob[lastIdx] ?? 0;
    blob[lastIdx] = last ^ 0xff;
    await expect(decryptToString(key, blob)).rejects.toBeInstanceOf(DecryptError);
  });

  test('truncated blob fails with DecryptError', async () => {
    const key = await importAesKey(VALID_KEY);
    await expect(decryptToString(key, new Uint8Array(8))).rejects.toBeInstanceOf(DecryptError);
  });
});

describe('RefreshTokenStore', () => {
  test('save then load round-trips', async () => {
    const root = tempRoot();
    try {
      const store = new RefreshTokenStore({ rootDir: root, encryptionKeyHex: VALID_KEY });
      expect(await store.exists('17101520')).toBe(false);
      await store.save('17101520', 'refresh-xyz');
      expect(await store.exists('17101520')).toBe(true);
      expect(await store.load('17101520')).toBe('refresh-xyz');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('load returns null when file missing', async () => {
    const root = tempRoot();
    try {
      const store = new RefreshTokenStore({ rootDir: root, encryptionKeyHex: VALID_KEY });
      expect(await store.load('does-not-exist')).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects path-traversal account ids', () => {
    const store = new RefreshTokenStore({ rootDir: '/tmp', encryptionKeyHex: VALID_KEY });
    expect(() => store.pathFor('../etc')).toThrow(SecretStoreError);
    expect(() => store.pathFor('a/b')).toThrow(SecretStoreError);
    expect(() => store.pathFor('a b')).toThrow(SecretStoreError);
  });

  test('cross-key load fails with DecryptError', async () => {
    const root = tempRoot();
    try {
      const a = new RefreshTokenStore({ rootDir: root, encryptionKeyHex: VALID_KEY });
      const b = new RefreshTokenStore({ rootDir: root, encryptionKeyHex: OTHER_KEY });
      await a.save('17101520', 'tok');
      await expect(b.load('17101520')).rejects.toBeInstanceOf(DecryptError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('persisted file is mode 0600 and starts with the iv (no plaintext leak)', async () => {
    const root = tempRoot();
    try {
      const store = new RefreshTokenStore({ rootDir: root, encryptionKeyHex: VALID_KEY });
      await store.save('acct1', 'super-secret-refresh-token');
      const path = store.pathFor('acct1');
      const { statSync } = await import('node:fs');
      const mode = statSync(path).mode & 0o777;
      expect(mode).toBe(0o600);
      const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
      expect(bytes.length).toBeGreaterThan(12 + 16);
      const asText = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      expect(asText.includes('super-secret-refresh-token')).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
