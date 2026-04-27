// AES-GCM refresh-token store — BLUEPRINT §10.2 hard requirement.
// Layout on disk: <rootDir>/<accountId>/refresh_token.enc, mode 0600,
// raw bytes = iv(12) || aes-gcm-ciphertext+tag. Decrypt verifies the tag,
// so any disk tamper or wrong key surfaces as a typed `DecryptError`.

import { chmod, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const IV_BYTES = 12;
const KEY_BYTES = 32;
const KEY_HEX_LEN = KEY_BYTES * 2;
const TOKEN_FILENAME = 'refresh_token.enc';

export class SecretStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretStoreError';
  }
}
export class DecryptError extends SecretStoreError {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptError';
  }
}

export interface SecretStoreConfig {
  rootDir: string;
  encryptionKeyHex: string;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length !== KEY_HEX_LEN || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new SecretStoreError(
      `SECRETS_ENCRYPTION_KEY must be ${KEY_HEX_LEN} hex chars (${KEY_BYTES} bytes); got ${hex.length}`,
    );
  }
  const out = new Uint8Array(KEY_BYTES);
  for (let i = 0; i < KEY_BYTES; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// Web Crypto wants a strict ArrayBuffer-backed view; Uint8Array<ArrayBufferLike>
// (the default inferred type under TS 6) is rejected by the AesGcmParams.iv slot
// even though the runtime is identical. Copy into a fresh ArrayBuffer view so
// the type matches without a `BufferSource` cast at every call site.
function asArrayBufferUint8(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(src.byteLength);
  const view = new Uint8Array(buf);
  view.set(src);
  return view;
}

export async function importAesKey(hex: string): Promise<CryptoKey> {
  const raw = asArrayBufferUint8(hexToBytes(hex));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<Uint8Array> {
  const ivBuf = new ArrayBuffer(IV_BYTES);
  const iv = new Uint8Array(ivBuf);
  crypto.getRandomValues(iv);
  const data = asArrayBufferUint8(new TextEncoder().encode(plaintext));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return out;
}

export async function decryptToString(key: CryptoKey, blob: Uint8Array): Promise<string> {
  if (blob.length <= IV_BYTES) {
    throw new DecryptError(`ciphertext shorter than iv (${blob.length} <= ${IV_BYTES})`);
  }
  const iv = asArrayBufferUint8(blob.subarray(0, IV_BYTES));
  const ct = asArrayBufferUint8(blob.subarray(IV_BYTES));
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    throw new DecryptError('AES-GCM tag mismatch — wrong key or tampered ciphertext');
  }
}

export class RefreshTokenStore {
  readonly #cfg: SecretStoreConfig;
  #key: Promise<CryptoKey> | null = null;

  constructor(cfg: SecretStoreConfig) {
    this.#cfg = cfg;
  }

  pathFor(accountId: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(accountId)) {
      throw new SecretStoreError(`unsafe accountId: ${accountId}`);
    }
    return join(this.#cfg.rootDir, accountId, TOKEN_FILENAME);
  }

  async exists(accountId: string): Promise<boolean> {
    try {
      await stat(this.pathFor(accountId));
      return true;
    } catch {
      return false;
    }
  }

  async save(accountId: string, refreshToken: string): Promise<void> {
    const key = await this.#getKey();
    const blob = await encryptString(key, refreshToken);
    const path = this.pathFor(accountId);
    await mkdir(join(this.#cfg.rootDir, accountId), { recursive: true, mode: 0o700 });
    await Bun.write(path, blob);
    await chmod(path, 0o600);
  }

  async load(accountId: string): Promise<string | null> {
    const path = this.pathFor(accountId);
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    const blob = new Uint8Array(await file.arrayBuffer());
    const key = await this.#getKey();
    return decryptToString(key, blob);
  }

  #getKey(): Promise<CryptoKey> {
    if (!this.#key) this.#key = importAesKey(this.#cfg.encryptionKeyHex);
    return this.#key;
  }
}
