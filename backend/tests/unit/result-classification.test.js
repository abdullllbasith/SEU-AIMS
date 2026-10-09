import assert from 'node:assert/strict';
import test from 'node:test';
import { actionForExistingResult, blockConflictingIdentities } from '../../src/modules/results/services/classification.js';
import { normalizeRegistrationNumber, normalizeResultCode, normalizeSubjectCode } from '../../src/modules/results/services/normalize.js';

test('unchanged official result is not treated as an update', () => {
  assert.equal(actionForExistingResult(undefined, 'A'), 'NEW');
  assert.equal(actionForExistingResult('A', 'A'), 'UNCHANGED');
  assert.equal(actionForExistingResult('E(CA)', 'B'), 'UPDATE');
});

test('a conflicting duplicate blocks every row of that identity', () => {
  const rows = blockConflictingIdentities([
    {
      registrationNumber: 'SEU/IS/22/ICT/001',
      subjectCode: 'ICT1233',
      rowStatus: 'VALID',
      proposedAction: 'NEW',
      validationErrors: [],
    },
    {
      registrationNumber: 'SEU/IS/22/ICT/001',
      subjectCode: 'ICT1233',
      rowStatus: 'BLOCKED',
      proposedAction: 'SKIP',
      validationErrors: ['INTRA_IMPORT_CONFLICT'],
    },
  ]);
  assert.equal(rows[0].rowStatus, 'BLOCKED');
  assert.equal(rows[0].proposedAction, 'SKIP');
  assert.ok(rows[0].validationErrors.includes('INTRA_IMPORT_CONFLICT'));
  assert.equal(rows[1].proposedAction, 'SKIP');
});

test('registration, subject, and E(CA) normalization keep the canonical values', () => {
  assert.equal(normalizeRegistrationNumber(' seu/is/22/ict/001 '), 'SEU/IS/22/ICT/001');
  assert.equal(normalizeSubjectCode(' ict1233 '), 'ICT1233');
  assert.equal(normalizeResultCode('eca'), 'E(CA)');
  assert.equal(normalizeResultCode('B+'), 'B+');
});
