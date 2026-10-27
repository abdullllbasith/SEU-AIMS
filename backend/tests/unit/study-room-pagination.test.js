import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHistoryLimit } from '../../src/modules/study-room/utils/http.js';
import { ValidationError } from '../../src/shared/errors/app-error.js';

test('history limit rejects non-positive values and caps oversized values', () => {
  assert.equal(parseHistoryLimit({}, 50, 30), 30);
  assert.equal(parseHistoryLimit({ limit: '10' }, 50, 30), 10);
  assert.equal(parseHistoryLimit({ limit: '999' }, 50, 30), 50);
  assert.throws(() => parseHistoryLimit({ limit: '-10000' }, 50, 30), ValidationError);
  assert.throws(() => parseHistoryLimit({ limit: '0' }, 50, 30), ValidationError);
  assert.throws(() => parseHistoryLimit({ limit: 'nope' }, 50, 30), ValidationError);
});
