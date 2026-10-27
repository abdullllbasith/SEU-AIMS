import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword } from '../../src/modules/authentication/security/passwords.js';

test('passwords are hashed with argon2id and never stored in plaintext', async () => {
  const hash = await hashPassword('correcthorse', { minLength: 10 });
  assert.equal(hash.includes('correcthorse'), false);
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(hash, 'correcthorse'), true);
  assert.equal(await verifyPassword(hash, 'wrong-password'), false);
});
