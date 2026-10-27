const PROTOCOL = 'webcrypto-ecdh-aesgcm-v1';

function toUint8(bytes) {
  if (bytes instanceof Uint8Array) {
    return bytes;
  }
  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  return new Uint8Array(bytes);
}

function bytesToB64(bytes) {
  let binary = '';
  const array = toUint8(bytes);
  for (let i = 0; i < array.length; i += 1) {
    binary += String.fromCharCode(array[i]);
  }
  return btoa(binary);
}

function b64ToBytes(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export const STUDY_ROOM_CRYPTO_PROTOCOL = PROTOCOL;

export async function generateIdentityKeyPair() {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
}

export async function exportPublicJwk(publicKey) {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  delete jwk.d;
  delete jwk.key_ops;
  delete jwk.ext;
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

export async function importPublicJwk(jwk) {
  return crypto.subtle.importKey('jwk', { ...jwk, kty: 'EC', crv: 'P-256' }, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}

export async function importPrivateJwk(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    { ...jwk, kty: 'EC', crv: 'P-256', key_ops: ['deriveBits'] },
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
}

export async function exportPrivateJwk(privateKey) {
  return crypto.subtle.exportKey('jwk', privateKey);
}

async function hkdfAesKey(rawBits, info) {
  const base = await crypto.subtle.importKey('raw', rawBits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(info),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function derivePrivateConversationKey(myPrivateKey, peerPublicKey, conversationId, participantKey) {
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peerPublicKey }, myPrivateKey, 256);
  return hkdfAesKey(bits, `seu-aims-private-v1|${participantKey}|${conversationId}`);
}

export async function generateGroupKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function exportRawKey(key) {
  return crypto.subtle.exportKey('raw', key);
}

export async function importRawAesKey(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

export async function wrapGroupKey(groupRaw, myPrivateKey, recipientPublicKey) {
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: recipientPublicKey }, myPrivateKey, 256);
  const wrapKey = await hkdfAesKey(bits, 'seu-aims-wrap-v1');
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, wrapKey, groupRaw);
  return { wrappedKey: bytesToB64(wrapped), nonce: bytesToB64(nonce) };
}

export async function unwrapGroupKey(envelope, myPrivateKey, wrapperPublicKey) {
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: wrapperPublicKey }, myPrivateKey, 256);
  const wrapKey = await hkdfAesKey(bits, 'seu-aims-wrap-v1');
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(envelope.nonce) },
    wrapKey,
    b64ToBytes(envelope.wrappedKey),
  );
  return importRawAesKey(raw);
}

export async function encryptPlaintext(aesKey, plaintext, keyVersion = '1') {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: bytesToB64(cipher),
    nonce: bytesToB64(nonce),
    keyVersion,
    protocolVersion: PROTOCOL,
  };
}

export async function decryptPayload(aesKey, payload) {
  const bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(payload.nonce) },
    aesKey,
    b64ToBytes(payload.ciphertext),
  );
  return new TextDecoder().decode(bytes);
}

export function fingerprintJwk(jwk) {
  return `${jwk.x || ''}`.slice(0, 8);
}
