import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { fanoutNotification } from '../../src/modules/notifications/index.js';
import { Notification } from '../../src/modules/notifications/models/notification.model.js';
import { seedQaWorld } from '../helpers/qa-fixtures.js';
import { InMemoryJobQueue } from '../../src/infrastructure/queue/job-queue.js';
import { createDraft } from '../../src/modules/ca-recovery/services/application.service.js';
import { CaApplicationWindow } from '../../src/modules/ca-recovery/models/ca-application-window.model.js';
import { CaApplication } from '../../src/modules/ca-recovery/models/ca-application.model.js';
import { ROLES } from '../../src/shared/constants/roles.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-14';
process.env.NODE_ENV = 'test';

let world;

before(async () => {
  await startIsolatedMongo();
});

after(async () => {
  await stopIsolatedMongo();
});

beforeEach(async () => {
  await clearIsolatedMongo();
  world = await seedQaWorld();
});

test('duplicate_notification_fanout_creates_single_in_app_row', async () => {
  const queue = new InMemoryJobQueue();
  const input = {
    recipientUserId: world.studentA._id,
    type: 'NOTICE_PUBLISHED',
    sourceModule: 'notices-calendar',
    sourceId: 'same-notice',
    actionPath: '/notices',
    departmentId: world.departmentA._id,
    infrastructure: { queue },
  };
  await Promise.all([fanoutNotification(input), fanoutNotification(input)]);
  const count = await Notification.countDocuments({
    recipientUserId: world.studentA._id,
    type: 'NOTICE_PUBLISHED',
    channel: 'IN_APP',
  });
  assert.equal(count, 1);
});

test('duplicate_ca_application_draft_creates_single_active_application', async () => {
  await CaApplication.deleteMany({ studentUserId: world.studentB._id });
  await CaApplicationWindow.create({
    departmentId: world.departmentA._id,
    academicYearId: world.year2._id,
    semesterId: world.sem2._id,
    opensAt: new Date(Date.now() - 3600_000),
    closesAt: new Date(Date.now() + 3600_000),
    published: true,
    suspended: false,
  });
  const principal = {
    userId: world.studentB._id,
    role: ROLES.STUDENT,
    departmentId: world.departmentA._id,
  };
  const body = {
    academicYearId: String(world.year2._id),
    semesterId: String(world.sem2._id),
    incompleteCaIds: [String(world.incompleteB._id)],
  };
  const results = await Promise.allSettled([createDraft(principal, body), createDraft(principal, body)]);
  const fulfilled = results.filter((item) => item.status === 'fulfilled').length;
  const rejected = results.filter((item) => item.status === 'rejected').length;
  assert.equal(fulfilled + rejected, 2);
  assert.ok(fulfilled >= 1);
  const active = await CaApplication.countDocuments({
    studentUserId: world.studentB._id,
    workflowStatus: { $in: ['DRAFT', 'SUBMITTED'] },
  });
  assert.equal(active, 1);
});
