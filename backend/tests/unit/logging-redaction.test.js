import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogger } from '../../src/infrastructure/logging/logger.js';

test('structured logs redact secrets and contact fields', () => {
  const chunks = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  try {
    const logger = createLogger({ service: 'redact-test', level: 'info' });
    logger.info('event', {
      password: 'hunter2',
      email: 'hidden@example.test',
      token: 'abc',
    });
  } finally {
    process.stdout.write = original;
  }
  const line = chunks.join('');
  assert.ok(line.includes('[redacted]'));
  assert.equal(line.includes('hunter2'), false);
  assert.equal(line.includes('hidden@example.test'), false);
  assert.equal(line.includes('"token":"[redacted]"'), true);
});
