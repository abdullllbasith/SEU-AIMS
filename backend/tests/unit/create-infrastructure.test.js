import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createInfrastructure } from '../../src/infrastructure/create-infrastructure.js';
import { loadConfig } from '../../src/config/index.js';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('createInfrastructure imports and bootstraps with connect: false', async () => {
  const config = loadConfig();
  config.redis = { url: '' };

  const infrastructure = await createInfrastructure({
    config,
    logger: { warn() {}, info() {}, error() {}, debug() {} },
    backendRoot,
    connect: false,
  });

  assert.ok(infrastructure.queue);
  assert.equal(infrastructure.queue.adapter, 'memory');
  assert.ok(infrastructure.storage);
  assert.ok(infrastructure.email);
  assert.ok(infrastructure.whatsapp);
  assert.ok(infrastructure.malwareScanner);
  assert.equal(infrastructure.redis, null);
});
