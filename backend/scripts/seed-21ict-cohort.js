#!/usr/bin/env node
/**
 * Dev-only cohort accounts 21ict001@seu.ac.lk … 21ict140@seu.ac.lk.
 * Registration numbers are SEU/IS/21/ICT/001 … SEU/IS/21/ICT/140.
 * Skips emails or registration numbers that already exist.
 * Placed in the 21 ICT batch, one academic year ahead of the 22 ICT cohort (Year 3 · Semester 2).
 * Odd registration numbers are Software Technologies (SWT). Even numbers are Network & Security Technologies (NST).
 */
import dotenv from 'dotenv';
import { connectMongo, disconnectMongo } from '../src/infrastructure/database/mongo.js';
import { hashPassword } from '../src/modules/authentication/security/passwords.js';
import { User } from '../src/modules/authentication/models/user.model.js';
import { StudentAcademicContext } from '../src/modules/academic-foundation/models/student-academic-context.model.js';
import { StudentAcademicHistory } from '../src/modules/academic-foundation/models/student-academic-history.model.js';
import { Batch } from '../src/modules/academic-foundation/models/batch.model.js';
import { AcademicYear } from '../src/modules/academic-foundation/models/academic-year.model.js';
import { Semester } from '../src/modules/academic-foundation/models/semester.model.js';
import { ROLES } from '../src/shared/constants/roles.js';

dotenv.config({ path: '../.env' });
dotenv.config();

if (process.env.NODE_ENV === 'production') {
  process.stderr.write('Refusing to seed cohort accounts into production.\n');
  process.exit(1);
}

const PASSWORD = 'correcthorse';
const FROM = 1;
const TO = 140;

function pad(n) {
  return String(n).padStart(3, '0');
}

function specializationFor(registrationNumber) {
  const sequence = Number(String(registrationNumber).match(/(\d+)$/)?.[1] || 0);
  return sequence % 2 === 1 ? 'SWT' : 'NST';
}

await connectMongo({ uri: process.env.MONGODB_URI, serverSelectionTimeoutMS: 20000 });

const anchor = await StudentAcademicContext.findOne({ registrationNumber: 'SEU/IS/22/ICT/001' }).lean();
const departmentId = anchor?.departmentId;
if (!departmentId) {
  process.stderr.write('22 ICT cohort was not found, so the 21 ICT department could not be chosen.\n');
  await disconnectMongo();
  process.exit(1);
}

const batch = await Batch.findOne({ departmentId, code: '21ICT', status: 'ACTIVE' }).lean();
const year = await AcademicYear.findOne({ departmentId, sequence: 3, status: 'ACTIVE' }).lean();
const semester = year
  ? await Semester.findOne({ academicYearId: year._id, sequence: 2, status: 'ACTIVE' }).lean()
  : null;
if (!batch || !year || !semester) {
  process.stderr.write('21 ICT batch or Year 3 · Semester 2 was not found for this department.\n');
  await disconnectMongo();
  process.exit(1);
}

const passwordHash = await hashPassword(PASSWORD, { minLength: 10 });
const wanted = [];
for (let n = FROM; n <= TO; n += 1) {
  const code = pad(n);
  wanted.push({
    email: `21ict${code}@seu.ac.lk`,
    registrationNumber: `SEU/IS/21/ICT/${code}`,
    displayName: `21ICT${code}`,
  });
}

const existingUsers = await User.find({ email: { $in: wanted.map((row) => row.email) } })
  .select('email')
  .lean();
const existingRegs = await StudentAcademicContext.find({
  registrationNumber: { $in: wanted.map((row) => row.registrationNumber) },
})
  .select('registrationNumber')
  .lean();
const skipEmails = new Set(existingUsers.map((row) => row.email));
const skipRegs = new Set(existingRegs.map((row) => row.registrationNumber));
const toCreate = wanted.filter((row) => !skipEmails.has(row.email) && !skipRegs.has(row.registrationNumber));

let created = 0;
if (toCreate.length) {

const users = await User.insertMany(
  toCreate.map((row) => ({
    role: ROLES.STUDENT,
    email: row.email,
    displayName: row.displayName,
    accountStatus: 'ACTIVE',
    departmentId,
    passwordHash,
    lecturerStatus: 'NOT_APPLICABLE',
  })),
  { ordered: true },
);

const contexts = await StudentAcademicContext.insertMany(
  users.map((user, index) => ({
    userId: user._id,
    departmentId,
    batchId: batch._id,
    registrationNumber: toCreate[index].registrationNumber,
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
    specialization: specializationFor(toCreate[index].registrationNumber),
    status: 'ACTIVE',
  })),
  { ordered: true },
);

await StudentAcademicHistory.insertMany(
  contexts.map((context) => ({
    studentAcademicContextId: context._id,
    userId: context.userId,
    academicYearId: year._id,
    semesterId: semester._id,
    specialization: context.specialization,
    recordedAt: new Date(),
  })),
  { ordered: true },
);
  created = users.length;
}

const year3 = await StudentAcademicContext.find({
  batchId: batch._id,
  currentAcademicYearId: year._id,
  status: 'ACTIVE',
})
  .select('userId registrationNumber specialization currentSemesterId')
  .lean();

const contextUpdates = [];
const historyUpdates = [];
const counts = { SWT: 0, NST: 0 };
for (const context of year3) {
  const specialization = specializationFor(context.registrationNumber);
  counts[specialization] += 1;
  if (context.specialization !== specialization) {
    contextUpdates.push({
      updateOne: {
        filter: { _id: context._id },
        update: { $set: { specialization } },
      },
    });
  }
  historyUpdates.push({
    updateOne: {
      filter: {
        studentAcademicContextId: context._id,
        academicYearId: year._id,
        semesterId: context.currentSemesterId || semester._id,
      },
      update: {
        $set: { specialization },
        $setOnInsert: { userId: context.userId, recordedAt: new Date() },
      },
      upsert: true,
    },
  });
}

if (contextUpdates.length) {
  await StudentAcademicContext.bulkWrite(contextUpdates, { ordered: false });
}
if (historyUpdates.length) {
  await StudentAcademicHistory.bulkWrite(historyUpdates, { ordered: false });
}

console.log(
  JSON.stringify(
    {
      created,
      skippedExisting: wanted.length - toCreate.length,
      year3Students: year3.length,
      specialization: counts,
      updated: contextUpdates.length,
      placement: {
        batch: batch.code,
        year: year.name,
        semester: semester.name,
        registration: 'SEU/IS/21/ICT/001–140',
      },
    },
    null,
    2,
  ),
);

await disconnectMongo();
