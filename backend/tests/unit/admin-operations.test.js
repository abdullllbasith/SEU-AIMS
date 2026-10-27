import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeSearch } from '../../src/modules/admin-operations/services/scope.js';
import { KPI_CATALOG } from '../../src/modules/admin-operations/constants.js';
import { IncompleteCa } from '../../src/modules/ca-recovery/index.js';
import { Notification } from '../../src/modules/notifications/index.js';
import { ResultImport } from '../../src/modules/results/index.js';
import { User } from '../../src/modules/authentication/index.js';

test('admin search rejects regex metacharacters and overlong input', () => {
  assert.equal(sanitizeSearch('SEU/IS/21/ICT/A01'), 'SEU/IS/21/ICT/A01');
  assert.throws(() => sanitizeSearch('.*all'), /pattern/);
  assert.throws(() => sanitizeSearch('a'.repeat(65)), /64/);
});

test('KPI catalog keys are unique and named', () => {
  const keys = KPI_CATALOG.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const item of KPI_CATALOG) {
    assert.ok(item.sourceDomain);
    assert.ok(item.calculation);
  }
});

test('department-scoped admin queries have supporting indexes', () => {
  const incomplete = IncompleteCa.schema.indexes().some(
    ([fields]) => fields.departmentId === 1 && fields.status === 1,
  );
  const notifications = Notification.schema.indexes().some(
    ([fields]) => fields.departmentId === 1 && fields.status === 1,
  );
  const imports = ResultImport.schema.indexes().some(
    ([fields]) => fields.departmentId === 1 && fields.processingStatus === 1,
  );
  const users = User.schema.indexes().some(
    ([fields]) => fields.departmentId === 1 && fields.role === 1 && fields.displayName === 1,
  );
  assert.ok(incomplete);
  assert.ok(notifications);
  assert.ok(imports);
  assert.ok(users);
});
