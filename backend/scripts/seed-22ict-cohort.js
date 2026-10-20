#!/usr/bin/env node
/**
 * Dev-only cohort accounts 22ict001@seu.ac.lk … 22ict117@seu.ac.lk.
 * Skips emails or registration numbers that already exist.
 * Placement matches the current 22 ICT Year 2 / Semester 2 context.
 */
import dotenv from 'dotenv';
import { connectMongo, disconnectMongo } from '../src/infrastructure/database/mongo.js';
import { hashPassword } from '../src/modules/authentication/security/passwords.js';
import { User } from '../src/modules/authentication/models/user.model.js';
import { StudentAcademicContext } from '../src/modules/academic-foundation/models/student-academic-context.model.js';
import { StudentAcademicHistory } from '../src/modules/academic-foundation/models/student-academic-history.model.js';
import { ROLES } from '../src/shared/constants/roles.js';

dotenv.config({ path: '../.env' });
dotenv.config();

if (process.env.NODE_ENV === 'production') {
  process.stderr.write('Refusing to seed cohort accounts into production.\n');
  process.exit(1);
}

const PASSWORD = 'correcthorse';
const FROM = 1;
const TO = 117;
const DEPARTMENT_ID = '6ac96faf1cf1622960e9b4bc';
const BATCH_ID = '6ac96fb21cf1622960e9b4ea';
const YEAR_ID = '6ac96fb31cf1622960e9b4f8';
const SEMESTER_ID = '6aca1c770ef6a481b0ffddc5';

function pad(n) {
  return String(n).padStart(3, '0');
}

await connectMongo({ uri: process.env.MONGODB_URI });

const passwordHash = await hashPassword(PASSWORD, { minLength: 10 });
const wanted = [];
for (let n = FROM; n <= TO; n += 1) {
  const code = pad(n);
  wanted.push({
    email: `22ict${code}@seu.ac.lk`,
    registrationNumber: `SEU/IS/22/ICT/${code}`,
    displayName: `22ICT${code}`,
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

const toCreate = wanted.filter(
  (row) => !skipEmails.has(row.email) && !skipRegs.has(row.registrationNumber),
);

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
    departmentId: DEPARTMENT_ID,
    passwordHash,
    lecturerStatus: 'NOT_APPLICABLE',
  })),
  { ordered: true },
);

const contexts = await StudentAcademicContext.insertMany(
  users.map((user, index) => ({
    userId: user._id,
    departmentId: DEPARTMENT_ID,
    batchId: BATCH_ID,
    registrationNumber: toCreate[index].registrationNumber,
    currentAcademicYearId: YEAR_ID,
    currentSemesterId: SEMESTER_ID,
    specialization: null,
    status: 'ACTIVE',
  })),
  { ordered: true },
);

await StudentAcademicHistory.insertMany(
  contexts.map((context) => ({
    studentAcademicContextId: context._id,
    userId: context.userId,
    academicYearId: YEAR_ID,
    semesterId: SEMESTER_ID,
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
      skippedEmails: [...skipEmails].sort(),
      placement: {
        batch: '22ICT',
        year: 'Year 2',
        semester: 'Semester 2',
      },
    },
    null,
    2,
  ),
);

await disconnectMongo();
