import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptText,
  derivePrivateKey,
  encryptText,
  generateGroupKey,
  generateIdentity,
  publicJwk,
} from '../helpers/chat-crypto.js';
import { Message } from '../../src/modules/study-room/index.js';
import { generateIdentityJwk } from '../../src/modules/study-room/services/identity-key.js';

test('private-chat keys round-trip and reject the wrong key', async () => {
  const alice = await generateIdentity();
  const bob = await generateIdentity();
  const mallory = await generateIdentity();
  const conversationId = '64b7c0a0a0a0a0a0a0a0a0a0';
  const participantKey = 'alice:bob';
  const aliceKey = await derivePrivateKey(alice.privateKey, bob.publicKey, conversationId, participantKey);
  const bobKey = await derivePrivateKey(bob.privateKey, alice.publicKey, conversationId, participantKey);
  const payload = await encryptText(aliceKey, 'batch meetup at 4');
  assert.equal(await decryptText(bobKey, payload), 'batch meetup at 4');
  const malloryKey = await derivePrivateKey(mallory.privateKey, alice.publicKey, conversationId, participantKey);
  await assert.rejects(() => decryptText(malloryKey, payload));
  const tampered = Buffer.from(payload.ciphertext, 'base64');
  tampered[0] ^= 0xff;
  await assert.rejects(() => decryptText(bobKey, { ...payload, ciphertext: tampered.toString('base64') }));
});

test('a server-issued identity key can derive bits with a browser P-256 key', async () => {
  const created = generateIdentityJwk();
  assert.equal(created.publicKeyJwk.d, undefined);
  assert.equal(typeof created.privateKeyJwk.d, 'string');
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    { ...created.privateKeyJwk, key_ops: ['deriveBits'] },
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const peer = await generateIdentity();
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer.publicKey }, privateKey, 256);
  assert.equal(bits.byteLength, 32);
});

test('public JWK export never includes the private scalar', async () => {
  const pair = await generateIdentity();
  const jwk = await publicJwk(pair.publicKey);
  assert.equal(jwk.d, undefined);
  assert.equal(jwk.kty, 'EC');
});

test('message schema has no plaintext body field', () => {
  const paths = Object.keys(Message.schema.paths);
  assert.equal(paths.includes('text'), false);
  assert.equal(paths.includes('plaintext'), false);
  assert.equal(paths.includes('body'), false);
  assert.ok(paths.includes('encryptedPayload.ciphertext'));
});

test('group AES key encrypts independently of server secrets', async () => {
  const group = await generateGroupKey();
  const payload = await encryptText(group, 'common room hello');
  assert.equal(await decryptText(group, payload), 'common room hello');
  const other = await generateGroupKey();
  await assert.rejects(() => decryptText(other, payload));
});
