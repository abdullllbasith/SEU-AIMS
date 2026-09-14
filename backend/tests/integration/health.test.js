import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';

function buildApp() {
  const config = loadConfig();
  const logger = createLogger({ service: 'seu-aims-test', level: 'error' });
  return createApp({ config, logger, infrastructure: {} });
}

test('GET /api/health returns ok without database', async () => {
  const response = await request(buildApp()).get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.status, 'ok');
});

test('unknown API routes require authentication', async () => {
  const response = await request(buildApp()).get('/api/does-not-exist');
  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});
