import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthenticationModule } from '../../src/modules/authentication/index.js';
import { createAcademicFoundationModule } from '../../src/modules/academic-foundation/index.js';
import { createLearningEnvironmentModule } from '../../src/modules/learning-environment/index.js';
import { createStudyRoomModule } from '../../src/modules/study-room/index.js';
import { createResultsModule } from '../../src/modules/results/index.js';
import { createGpaCgpaModule } from '../../src/modules/gpa-cgpa/index.js';
import { createCaRecoveryModule } from '../../src/modules/ca-recovery/index.js';
import { createNoticesCalendarModule } from '../../src/modules/notices-calendar/index.js';
import { createNotificationsModule } from '../../src/modules/notifications/index.js';
import { createFilesModule } from '../../src/modules/files/index.js';
import { createAuditSecurityModule } from '../../src/modules/audit-security/index.js';
import { JOB_NAMES } from '../../src/infrastructure/queue/job-names.js';

test('each logical module exposes a public id, prefix, and router', () => {
  const modules = [
    createAuthenticationModule(),
    createAcademicFoundationModule(),
    createLearningEnvironmentModule(),
    createStudyRoomModule(),
    createResultsModule(),
    createGpaCgpaModule(),
    createCaRecoveryModule(),
    createNoticesCalendarModule(),
    createNotificationsModule(),
    createFilesModule(),
    createAuditSecurityModule(),
  ];

  assert.equal(modules.length, 11);
  const ids = modules.map((module) => module.id).sort();
  assert.deepEqual(ids, [
    'academic-foundation',
    'audit-security',
    'authentication',
    'ca-recovery',
    'files',
    'gpa-cgpa',
    'learning-environment',
    'notices-calendar',
    'notifications',
    'results',
    'study-room',
  ]);

  for (const module of modules) {
    assert.ok(module.apiPrefix.startsWith('/api/'));
    assert.equal(typeof module.router, 'function');
  }
});

test('background job names cover the reserved async workflows', () => {
  assert.ok(JOB_NAMES.RESULT_PARSE);
  assert.ok(JOB_NAMES.ECA_DETECT);
  assert.ok(JOB_NAMES.GPA_RECALCULATE);
  assert.ok(JOB_NAMES.CA_PDF_GENERATE);
  assert.ok(JOB_NAMES.FILE_MALWARE_SCAN);
});
