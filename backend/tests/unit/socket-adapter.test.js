import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createRealtimeServer } from '../../src/infrastructure/realtime/socket-server.js';

test('createRealtimeServer stays in-process without Redis', async () => {
  const server = http.createServer();
  const io = await createRealtimeServer(server, { corsOrigin: true });
  assert.equal(io.adapterHint, 'in-process');
  io.close();
  server.close();
});
