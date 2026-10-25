#!/usr/bin/env node
/**
 * Dev-only cohort accounts 23ict001@seu.ac.lk … 23ict130@seu.ac.lk.
 * Registration numbers are SEU/IS/23/ICT/001 … SEU/IS/23/ICT/130.
 * Skips emails or registration numbers that already exist.
 * Placed in the 23 ICT batch, one academic year behind the 22 ICT cohort.
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
const TO = 130;

function pad(n) {
  return String(n).padStart(3, '0');
}

await connectMongo({ uri: process.env.MONGODB_URI, serverSelectionTimeoutMS: 20000 });

const anchor = await StudentAcademicContext.findOne({ registrationNumber: 'SEU/IS/22/ICT/001' }).lean();
const departmentId = anchor?.departmentId;
if (!departmentId) {
  process.stderr.write('22 ICT cohort was not found, so the 23 ICT department could not be chosen.\n');
  await disconnectMongo();
  process.exit(1);
}

const anchorYear = await AcademicYear.findById(anchor.currentAcademicYearId).select('sequence name').lean();
const anchorSemester = await Semester.findById(anchor.currentSemesterId).select('sequence name').lean();
const batch = await Batch.findOne({ departmentId, code: '23ICT', status: 'ACTIVE' }).lean();
const year = anchorYear
  ? await AcademicYear.findOne({
      departmentId,
      sequence: anchorYear.sequence - 1,
      status: 'ACTIVE',
    }).lean()
  : null;
const semester = year
  ? await Semester.findOne({
      academicYearId: year._id,
      sequence: anchorSemester?.sequence,
      status: 'ACTIVE',
    }).lean()
  : null;
if (!batch || !year || !semester) {
  process.stderr.write('23 ICT batch or the period one year behind the 22 ICT cohort was not found.\n');
  await disconnectMongo();
  process.exit(1);
}

const passwordHash = await hashPassword(PASSWORD, { minLength: 10 });
const wanted = [];
for (let n = FROM; n <= TO; n += 1) {
  const code = pad(n);
  wanted.push({
    email: `23ict${code}@seu.ac.lk`,
    registrationNumber: `SEU/IS/23/ICT/${code}`,
    displayName: `23ICT${code}`,
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

if (!toCreate.length) {
  console.log(JSON.stringify({ created: 0, skippedExisting: wanted.length }, null, 2));
  await disconnectMongo();
  process.exit(0);
}

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
    specialization: null,
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
    specialization: null,
    recordedAt: new Date(),
  })),
  { ordered: true },
);

console.log(
  JSON.stringify(
    {
      created: users.length,
      skippedExisting: wanted.length - toCreate.length,
      placement: {
        batch: batch.code,
        year: year.name,
        semester: semester.name,
        registration: 'SEU/IS/23/ICT/001–130',
      },
    },
    null,
    2,
  ),
);

await disconnectMongo();
