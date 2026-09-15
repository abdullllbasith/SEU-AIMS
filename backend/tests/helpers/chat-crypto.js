const PROTOCOL = 'webcrypto-ecdh-aesgcm-v1';

function b64(bytes) {
  return Buffer.from(bytes instanceof ArrayBuffer ? Buffer.from(bytes) : bytes).toString('base64');
}

function fromB64(value) {
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

export async function generateIdentity() {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
}

export async function publicJwk(publicKey) {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

async function hkdfAes(rawBits, info) {
  const base = await crypto.subtle.importKey('raw', rawBits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(info) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function derivePrivateKey(myPrivate, peerPublic, conversationId, participantKey) {
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peerPublic }, myPrivate, 256);
  return hkdfAes(bits, `seu-aims-private-v1|${participantKey}|${conversationId}`);
}

export async function generateGroupKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function wrapGroup(groupRaw, myPrivate, recipientPublic) {
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: recipientPublic }, myPrivate, 256);
  const wrapKey = await hkdfAes(bits, 'seu-aims-wrap-v1');
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, wrapKey, groupRaw);
  return { wrappedKey: b64(wrapped), nonce: b64(nonce) };
}

export async function encryptText(aesKey, plaintext) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: b64(cipher),
    nonce: b64(nonce),
    keyVersion: '1',
    protocolVersion: PROTOCOL,
  };
}

export async function decryptText(aesKey, payload) {
  const bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(payload.nonce) },
    aesKey,
    fromB64(payload.ciphertext),
  );
  return new TextDecoder().decode(bytes);
}

export { PROTOCOL };
