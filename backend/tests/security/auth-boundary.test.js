import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { createMalwareScanner } from '../../src/infrastructure/providers/malware-scanner.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-04';

test('unauthenticated API access is denied by default', async () => {
  const config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  const app = createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
  });
  const response = await request(app).get('/api/me');
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('unauthenticated academic administration is denied', async () => {
  const config = loadConfig();
  config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
  const app = createApp({
    config,
    logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
  });
  const response = await request(app).post('/api/academic/subject-offerings').send({});
  assert.equal(response.status, 401);
});

test('unconfigured malware scanner does not mark files clean', async () => {
  const scanner = createMalwareScanner({ config: {} });
  const result = await scanner.scan({ key: 'quarantine/example.bin' });
  assert.equal(result.clean, false);
  assert.equal(result.status, 'not_configured');
});
