import { describe, expect, it } from 'vitest';
import {
  decryptPayload,
  encryptPlaintext,
  generateGroupKey,
  generateIdentityKeyPair,
  STUDY_ROOM_CRYPTO_PROTOCOL,
} from './encryption.js';

describe('Study Room client encryption', () => {
  it('round-trips plaintext and authenticates ciphertext', async () => {
    const key = await generateGroupKey();
    const payload = await encryptPlaintext(key, 'hello study room');
    expect(payload.protocolVersion).toBe(STUDY_ROOM_CRYPTO_PROTOCOL);
    expect(payload.ciphertext.includes('hello study room')).toBe(false);
    await expect(decryptPayload(key, payload)).resolves.toBe('hello study room');
    const tampered = { ...payload, ciphertext: btoa(atob(payload.ciphertext).replace(/[\s\S]/, (ch) => String.fromCharCode(ch.charCodeAt(0) ^ 0xff))) };
    await expect(decryptPayload(key, tampered)).rejects.toBeTruthy();
  });

  it('does not export a private scalar on the public JWK', async () => {
    const pair = await generateIdentityKeyPair();
    const { exportPublicJwk } = await import('./encryption.js');
    const jwk = await exportPublicJwk(pair.publicKey);
    expect(jwk.d).toBeUndefined();
  });
});
