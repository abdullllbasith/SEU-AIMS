import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  runProgressionTransaction,
  transientTransactionError,
} from '../../src/modules/academic-foundation/services/progression-transaction.js';

test('transientTransactionError recognizes write conflict and transient labels', () => {
  assert.equal(transientTransactionError({ code: 112 }), true);
  assert.equal(transientTransactionError({ errorLabels: ['TransientTransactionError'] }), true);
  assert.equal(transientTransactionError({ code: 11000 }), false);
  assert.equal(transientTransactionError(new Error('other')), false);
});

test('runProgressionTransaction retries transient errors then succeeds', async () => {
  let calls = 0;
  const runner = async (work) => {
    calls += 1;
    if (calls === 1) {
      const error = new Error('WriteConflict');
      error.code = 112;
      error.errorLabels = ['TransientTransactionError'];
      throw error;
    }
    return work();
  };

  const result = await runProgressionTransaction(async () => 'ok', runner);
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
});

test('runProgressionTransaction stops after three transient failures', async () => {
  let calls = 0;
  const runner = async () => {
    calls += 1;
    const error = new Error('WriteConflict');
    error.code = 112;
    throw error;
  };

  await assert.rejects(() => runProgressionTransaction(async () => 'ok', runner), { code: 112 });
  assert.equal(calls, 3);
});

test('runProgressionTransaction does not retry non-transient errors', async () => {
  let calls = 0;
  const runner = async () => {
    calls += 1;
    const error = new Error('validation');
    error.code = 11000;
    throw error;
  };

  await assert.rejects(() => runProgressionTransaction(async () => 'ok', runner), { code: 11000 });
  assert.equal(calls, 1);
});
