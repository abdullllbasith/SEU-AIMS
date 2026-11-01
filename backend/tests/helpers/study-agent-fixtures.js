import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { startIsolatedMongo, stopIsolatedMongo } from './memory-mongo.js';
import { createApp } from '../../src/app/create-app.js';
import { loadConfig } from '../../src/config/index.js';
import { createLogger } from '../../src/infrastructure/logging/logger.js';
import { createFileStorage } from '../../src/infrastructure/storage/file-storage.js';
import { DevMockAiProvider } from '../../src/infrastructure/providers/ai-provider.js';
import { User } from '../../src/modules/authentication/models/user.model.js';
import { hashPassword } from '../../src/modules/authentication/security/passwords.js';
import { Department } from '../../src/modules/academic-foundation/models/department.model.js';
import { Batch } from '../../src/modules/academic-foundation/models/batch.model.js';
import { AcademicYear } from '../../src/modules/academic-foundation/models/academic-year.model.js';
import { Semester } from '../../src/modules/academic-foundation/models/semester.model.js';
import { Subject } from '../../src/modules/academic-foundation/models/subject.model.js';
import { SubjectOffering } from '../../src/modules/academic-foundation/models/subject-offering.model.js';
import { StudentAcademicContext } from '../../src/modules/academic-foundation/models/student-academic-context.model.js';
import { OfficialResource } from '../../src/modules/learning-environment/models/official-resource.model.js';
import { ResourceSection } from '../../src/modules/learning-environment/models/resource-section.model.js';
import { SharedFolder } from '../../src/modules/study-room/models/shared-folder.model.js';
import { SharedResource } from '../../src/modules/study-room/models/shared-resource.model.js';
import { StoredFile } from '../../src/modules/files/models/stored-file.model.js';
import { ROLES } from '../../src/shared/constants/roles.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-study-agent';
process.env.NODE_ENV = 'test';

export const PASSWORD = 'correcthorse';

/** Boots the real app with a mock AI provider. Returns null-ish handles when Mongo is unavailable. */
export function createAgentHarness() {
  const harness = { ready: false, app: null, config: null, provider: null, infrastructure: null, storage: null };

  harness.start = async () => {
    try {
      await startIsolatedMongo();
      harness.ready = true;
      const config = loadConfig();
      config.auth.jwtSecret = process.env.AUTH_JWT_SECRET;
      config.auth.loginMaxAttempts = 1000;
      config.api.rateLimitMax = 10_000;
      config.storage = { driver: 'local_dev', localPath: path.join(os.tmpdir(), `seu-aims-sa-${process.pid}`) };
      config.studyAgent.messagesPerMinute = 1000;
      config.studyAgent.dailyRequests = 100_000;
      harness.config = config;
      harness.storage = createFileStorage({ config, backendRoot: process.cwd() });
      harness.provider = new DevMockAiProvider();
      harness.enqueued = [];
      harness.infrastructure = {
        email: { send: async () => ({ accepted: false, provider: 'noop' }) },
        storage: harness.storage,
        malwareScanner: { scan: async () => ({ clean: true, status: 'clean' }) },
        queue: {
          enqueue: async (job) => {
            harness.enqueued.push(job);
            return { id: 'test' };
          },
        },
        aiProvider: harness.provider,
      };
      harness.app = createApp({
        config,
        logger: createLogger({ service: 'seu-aims-test', level: 'error' }),
        infrastructure: harness.infrastructure,
      });
    } catch (error) {
      process.stderr.write(`Skipping Study Agent tests: ${error.message}\n`);
    }
  };

  harness.stop = async () => {
    if (harness.ready) {
      await stopIsolatedMongo();
    }
  };

  harness.login = async (email) => {
    const agent = request.agent(harness.app);
    const csrf = await agent.get('/api/auth/csrf');
    const response = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf.body.data.csrfToken)
      .send({ identifier: email, password: PASSWORD });
    assert.equal(response.status, 200);
    return { agent, csrfToken: response.body.data.csrfToken };
  };

  return harness;
}

async function createUser({ role, email, departmentId }) {
  return User.create({
    role,
    email,
    displayName: email.split('@')[0],
    accountStatus: 'ACTIVE',
    departmentId,
    passwordHash: await hashPassword(PASSWORD, { minLength: 10 }),
    lecturerStatus: role === ROLES.LECTURER ? 'VERIFIED' : 'NOT_APPLICABLE',
  });
}

/** Writes a real object to storage plus its StoredFile row. */
export async function createStoredFile(harness, { uploaderId, text, scanStatus = 'SAFE', availability = 'AVAILABLE', domain = 'OFFICIAL_RESOURCE', contextId, name = 'notes.txt', mimeType = 'text/plain' }) {
  const key = `test/${new Date().getTime()}-${Math.random().toString(16).slice(2)}-${name}`;
  await harness.storage.putObject({ key, body: Buffer.from(text), contentType: mimeType });
  return StoredFile.create({
    storageKey: key,
    originalFilename: name,
    displayFilename: name,
    mimeType,
    sizeBytes: Buffer.byteLength(text),
    uploadedByUserId: uploaderId,
    owningDomain: domain,
    owningContextId: contextId,
    scanStatus,
    availability,
  });
}

export async function createOfficialResource(harness, world, { title, text, publicationState = 'PUBLISHED', scanStatus = 'SAFE', availability = 'AVAILABLE', category = 'LECTURE', offering = world.offering, deletedAt }) {
  const file = await createStoredFile(harness, {
    uploaderId: world.lecturer._id,
    text,
    scanStatus,
    availability,
    contextId: offering._id,
    name: `${title}.txt`,
  });
  const resource = await OfficialResource.create({
    departmentId: world.department._id,
    subjectOfferingId: offering._id,
    sectionId: world.section._id,
    createdByUserId: world.lecturer._id,
    fileId: file._id,
    title,
    category,
    publicationState,
    deletedAt,
  });
  return { resource, file };
}

export async function createSharedResource(harness, world, { title, text, moderationState = 'AVAILABLE', scanStatus = 'SAFE', availability = 'AVAILABLE', batch = world.batch }) {
  const folder = await SharedFolder.create({
    departmentId: world.department._id,
    batchId: batch._id,
    createdByUserId: world.studentA._id,
    name: `Folder ${title}`,
  });
  const file = await createStoredFile(harness, {
    uploaderId: world.studentA._id,
    text,
    scanStatus,
    availability,
    domain: 'STUDY_ROOM_RESOURCE',
    contextId: folder._id,
    name: `${title}.txt`,
  });
  const resource = await SharedResource.create({
    departmentId: world.department._id,
    batchId: batch._id,
    folderId: folder._id,
    fileId: file._id,
    createdByUserId: world.studentA._id,
    title,
    moderationState,
    reviewStatus: 'NOT_REQUIRED',
  });
  return { resource, file };
}

/** Two batches, two students in batch A, one in batch B, a lecturer and an admin. */
export async function seedAgentWorld() {
  const department = await Department.create({ code: 'ICT', name: 'Department of ICT' });
  const batch = await Batch.create({ departmentId: department._id, code: '22', name: '22 batch' });
  const otherBatch = await Batch.create({ departmentId: department._id, code: '21', name: '21 batch' });
  const year = await AcademicYear.create({ departmentId: department._id, sequence: 1, name: 'Year 1' });
  const semester = await Semester.create({
    departmentId: department._id,
    academicYearId: year._id,
    sequence: 1,
    name: 'Semester 1',
  });
  const subject = await Subject.create({ departmentId: department._id, code: 'ICT101', name: 'Database Systems', credits: 3 });
  const otherSubject = await Subject.create({ departmentId: department._id, code: 'ICT909', name: 'Other Batch Subject', credits: 3 });
  const offering = await SubjectOffering.create({
    departmentId: department._id,
    subjectId: subject._id,
    batchId: batch._id,
    academicYearId: year._id,
    semesterId: semester._id,
  });
  const otherOffering = await SubjectOffering.create({
    departmentId: department._id,
    subjectId: otherSubject._id,
    batchId: otherBatch._id,
    academicYearId: year._id,
    semesterId: semester._id,
  });
  const section = await ResourceSection.create({ departmentId: department._id, subjectOfferingId: offering._id, name: 'Lectures' });
  const otherSection = await ResourceSection.create({ departmentId: department._id, subjectOfferingId: otherOffering._id, name: 'Lectures' });

  const admin = await createUser({ role: ROLES.DEPARTMENT_ADMINISTRATOR, email: 'admin@example.test', departmentId: department._id });
  const lecturer = await createUser({ role: ROLES.LECTURER, email: 'lecturer@example.test', departmentId: department._id });
  const studentA = await createUser({ role: ROLES.STUDENT, email: 'a@example.test', departmentId: department._id });
  const studentB = await createUser({ role: ROLES.STUDENT, email: 'b@example.test', departmentId: department._id });
  const studentOther = await createUser({ role: ROLES.STUDENT, email: 'other@example.test', departmentId: department._id });
  const noContext = await createUser({ role: ROLES.STUDENT, email: 'nocontext@example.test', departmentId: department._id });

  const context = (user, theBatch, number) =>
    StudentAcademicContext.create({
      userId: user._id,
      departmentId: department._id,
      batchId: theBatch._id,
      registrationNumber: `SEU/IS/22/ICT/${number}`,
      currentAcademicYearId: year._id,
      currentSemesterId: semester._id,
    });
  await context(studentA, batch, '001');
  await context(studentB, batch, '002');
  await context(studentOther, otherBatch, '009');

  return {
    department,
    batch,
    otherBatch,
    year,
    semester,
    subject,
    offering,
    otherOffering,
    section,
    otherSection,
    admin,
    lecturer,
    studentA,
    studentB,
    studentOther,
    noContext,
  };
}
