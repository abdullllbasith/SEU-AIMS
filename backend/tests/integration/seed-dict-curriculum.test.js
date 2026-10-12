import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { Department } from '../../src/modules/academic-foundation/models/department.model.js';
import { Batch } from '../../src/modules/academic-foundation/models/batch.model.js';
import { AcademicYear } from '../../src/modules/academic-foundation/models/academic-year.model.js';
import { Semester } from '../../src/modules/academic-foundation/models/semester.model.js';
import { CurriculumMapping } from '../../src/modules/academic-foundation/models/curriculum-mapping.model.js';
import { SubjectOffering } from '../../src/modules/academic-foundation/models/subject-offering.model.js';
import { Subject } from '../../src/modules/academic-foundation/models/subject.model.js';
import { User } from '../../src/modules/authentication/models/user.model.js';
import { hashPassword } from '../../src/modules/authentication/security/passwords.js';
import { ROLES } from '../../src/shared/constants/roles.js';
import { commitCatalogImport } from '../../src/modules/academic-foundation/services/catalog-import.service.js';
import { assignBatchAcademicContext } from '../../src/modules/academic-foundation/services/academic.service.js';

process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'test-jwt-secret-prompt-08';
process.env.NODE_ENV = 'test';

before(async () => {
  await startIsolatedMongo();
});

after(async () => {
  await stopIsolatedMongo();
});

beforeEach(async () => {
  await clearIsolatedMongo();
});

async function principalFor(departmentId) {
  const admin = await User.create({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'admin@example.test',
    displayName: 'Admin',
    accountStatus: 'ACTIVE',
    departmentId,
    passwordHash: await hashPassword('correcthorse', { minLength: 10 }),
    lecturerStatus: 'NOT_APPLICABLE',
  });
  return { userId: admin._id, role: ROLES.DEPARTMENT_ADMINISTRATOR, departmentId };
}

async function seedOfferingsForPeriod(departmentId, batch, year, semester) {
  const mappings = await CurriculumMapping.find({
    departmentId,
    academicYearId: year._id,
    semesterId: semester._id,
    status: 'ACTIVE',
  });
  let created = 0;
  for (const mapping of mappings) {
    const identity = {
      departmentId,
      subjectId: mapping.subjectId,
      batchId: batch._id,
      academicYearId: year._id,
      semesterId: semester._id,
    };
    if (await SubjectOffering.findOne(identity)) {
      continue;
    }
    await SubjectOffering.create({ ...identity, status: 'ACTIVE' });
    created += 1;
  }
  return created;
}

test('catalog import plus period offerings cover Years 1–4 curriculum rows', async () => {
  const department = await Department.create({ code: 'ICT', name: 'ICT' });
  const principal = await principalFor(department._id);
  const imported = await commitCatalogImport(principal);
  assert.equal(imported.summary.mappingsCreated > 0, true);

  const year1 = await AcademicYear.findOne({ departmentId: department._id, sequence: 1 });
  const year2 = await AcademicYear.findOne({ departmentId: department._id, sequence: 2 });
  const year1Sem1 = await Semester.findOne({ academicYearId: year1._id, sequence: 1 });
  const year2Sem1 = await Semester.findOne({ academicYearId: year2._id, sequence: 1 });
  assert.equal(await CurriculumMapping.countDocuments({ academicYearId: year1._id }), 22);
  assert.equal(await CurriculumMapping.countDocuments({ academicYearId: year2._id }), 19);

  const batch = await Batch.create({
    departmentId: department._id,
    code: '22',
    name: '22 batch',
    status: 'ACTIVE',
  });
  await assignBatchAcademicContext(principal, String(batch._id), {
    currentAcademicYearId: String(year1._id),
    currentSemesterId: String(year1Sem1._id),
  });

  const createdY1 = await seedOfferingsForPeriod(department._id, batch, year1, year1Sem1);
  const createdY2 = await seedOfferingsForPeriod(department._id, batch, year2, year2Sem1);
  assert.equal(createdY1, 11);
  assert.equal(createdY2, 10);
  assert.equal(await Subject.countDocuments({ departmentId: department._id }), 97);
  assert.equal(await SubjectOffering.countDocuments({ batchId: batch._id }), 21);

  const secondImport = await commitCatalogImport(principal);
  assert.equal(secondImport.summary.mappingsCreated, 0);
  assert.equal(await SubjectOffering.countDocuments({ batchId: batch._id }), 21);
});
