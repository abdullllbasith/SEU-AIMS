#!/usr/bin/env node
/**
 * Isolated synthetic UI-scale dataset for layout/stress testing.
 * Fictional identities only (@scale.example.test). Refuses production.
 *
 * Default size (~1200 students). Override with:
 *   UI_SCALE_STUDENTS=400 UI_SCALE_LECTURERS=40 node scripts/seed-ui-scale.js
 *
 * Login: scale-admin@scale.example.test / correcthorse
 *        scale-student-0001@scale.example.test / correcthorse
 *        scale-lecturer-001@scale.example.test / correcthorse
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectMongo, disconnectMongo } from '../src/infrastructure/database/mongo.js';
import { hashPassword } from '../src/modules/authentication/security/passwords.js';
import { User } from '../src/modules/authentication/models/user.model.js';
import { Department } from '../src/modules/academic-foundation/models/department.model.js';
import { Batch } from '../src/modules/academic-foundation/models/batch.model.js';
import { AcademicYear } from '../src/modules/academic-foundation/models/academic-year.model.js';
import { Semester } from '../src/modules/academic-foundation/models/semester.model.js';
import { Subject } from '../src/modules/academic-foundation/models/subject.model.js';
import { SubjectOffering } from '../src/modules/academic-foundation/models/subject-offering.model.js';
import { LecturerAssignment } from '../src/modules/academic-foundation/models/lecturer-assignment.model.js';
import { StudentAcademicContext } from '../src/modules/academic-foundation/models/student-academic-context.model.js';
import { AcademicResult } from '../src/modules/results/models/academic-result.model.js';
import { IncompleteCa } from '../src/modules/ca-recovery/models/incomplete-ca.model.js';
import { CalendarEvent } from '../src/modules/notices-calendar/models/calendar-event.model.js';
import { Notice } from '../src/modules/notices-calendar/models/notice.model.js';
import { ROLES } from '../src/shared/constants/roles.js';

dotenv.config();

if (process.env.NODE_ENV === 'production') {
  process.stderr.write('Refusing to seed UI-scale data into production.\n');
  process.exit(1);
}

const STUDENT_COUNT = Math.max(50, Number(process.env.UI_SCALE_STUDENTS || 1200));
const LECTURER_COUNT = Math.max(10, Number(process.env.UI_SCALE_LECTURERS || 80));
const DEPT_CODE = 'UISCL';
const PASSWORD = 'correcthorse';
const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'E', 'E(CA)'];

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function insertChunks(Model, docs, size = 500) {
  for (const part of chunk(docs, size)) {
    await Model.insertMany(part, { ordered: false });
  }
}

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/seu_aims';
  console.log('Connecting to Mongo at', uri);
  await connectMongo({ uri });

  const existing = await Department.findOne({ code: DEPT_CODE });
  if (existing) {
    console.log(`Department ${DEPT_CODE} already exists (${existing._id}). Skipping reseed.`);
    console.log('Delete that department’s scale users/records manually if you need a fresh load.');
    await disconnectMongo();
    return;
  }

  const passwordHash = await hashPassword(PASSWORD, { minLength: 10 });
  const now = new Date();

  const department = await Department.create({
    code: DEPT_CODE,
    name: 'UI Scale Synthetic Department — Very Long Name For Layout Testing',
  });

  const batches = await Batch.insertMany([
    { departmentId: department._id, code: '20ICT', name: '20 ICT — Extended Batch Title' },
    { departmentId: department._id, code: '21ICT', name: '21 ICT' },
    { departmentId: department._id, code: '22ICT', name: '22 ICT' },
    { departmentId: department._id, code: '23ICT', name: '23 ICT Extreme Length Batch Label' },
  ]);

  const years = [];
  const semesters = [];
  for (let y = 1; y <= 4; y += 1) {
    const year = await AcademicYear.create({
      departmentId: department._id,
      sequence: y,
      name: `Year ${y}`,
      status: y <= 2 ? 'ACTIVE' : 'ACTIVE',
    });
    years.push(year);
    for (let s = 1; s <= 2; s += 1) {
      semesters.push(
        await Semester.create({
          departmentId: department._id,
          academicYearId: year._id,
          sequence: s,
          name: s === 1 && y > 1 ? `Semester ${s} Y${y}` : `Semester ${s}`,
          status: 'ACTIVE',
        }),
      );
    }
  }

  const subjectDocs = [];
  for (let i = 1; i <= 48; i += 1) {
    subjectDocs.push({
      departmentId: department._id,
      code: `SCL${String(1000 + i)}`,
      name:
        i % 7 === 0
          ? `Advanced Topics in Distributed Systems and Network Security ${i}`
          : `Scale Subject ${i}`,
      credits: 2 + (i % 3),
      status: 'ACTIVE',
    });
  }
  const subjects = await Subject.insertMany(subjectDocs);

  const currentYear = years[1];
  const currentSemester = semesters.find(
    (row) => String(row.academicYearId) === String(currentYear._id) && row.sequence === 1,
  );
  const offeringDocs = [];
  for (const batch of batches) {
    for (let i = 0; i < 12; i += 1) {
      offeringDocs.push({
        departmentId: department._id,
        subjectId: subjects[i]._id,
        batchId: batch._id,
        academicYearId: currentYear._id,
        semesterId: currentSemester._id,
        status: 'ACTIVE',
      });
    }
  }
  const offerings = await SubjectOffering.insertMany(offeringDocs);

  const admin = await User.create({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: 'scale-admin@scale.example.test',
    displayName: 'Scale Admin With A Long Display Name',
    accountStatus: 'ACTIVE',
    departmentId: department._id,
    passwordHash,
    lecturerStatus: 'NOT_APPLICABLE',
  });

  const lecturerDocs = [];
  for (let i = 1; i <= LECTURER_COUNT; i += 1) {
    lecturerDocs.push({
      role: ROLES.LECTURER,
      email: `scale-lecturer-${String(i).padStart(3, '0')}@scale.example.test`,
      displayName:
        i % 11 === 0
          ? `Lecturer ${i} Extremely Long Professional Name For Truncation Checks`
          : `Scale Lecturer ${i}`,
      accountStatus: 'ACTIVE',
      departmentId: department._id,
      passwordHash,
      lecturerStatus: i % 17 === 0 ? 'UNVERIFIED' : 'VERIFIED',
    });
  }
  console.log(`Inserting ${lecturerDocs.length} lecturers…`);
  const lecturers = await User.insertMany(lecturerDocs);

  const verified = lecturers.filter((row) => row.lecturerStatus === 'VERIFIED');
  const assignmentDocs = offerings.map((offering, index) => ({
    departmentId: department._id,
    lecturerUserId: verified[index % verified.length]._id,
    subjectOfferingId: offering._id,
    assignedByUserId: admin._id,
    isActive: true,
  }));
  await LecturerAssignment.insertMany(assignmentDocs);

  const studentDocs = [];
  for (let i = 1; i <= STUDENT_COUNT; i += 1) {
    studentDocs.push({
      role: ROLES.STUDENT,
      email: `scale-student-${String(i).padStart(4, '0')}@scale.example.test`,
      displayName:
        i % 13 === 0
          ? `Student ${i} With An Unusually Long Personal Name For Card Layout`
          : `Scale Student ${i}`,
      accountStatus: 'ACTIVE',
      departmentId: department._id,
      passwordHash,
      lecturerStatus: 'NOT_APPLICABLE',
    });
  }
  console.log(`Inserting ${studentDocs.length} students…`);
  const students = [];
  for (const part of chunk(studentDocs, 400)) {
    const created = await User.insertMany(part);
    students.push(...created);
  }

  const contextDocs = students.map((student, index) => {
    const batch = batches[index % batches.length];
    return {
      departmentId: department._id,
      userId: student._id,
      registrationNumber: `SEU/IS/22/ICT/S${String(index + 1).padStart(4, '0')}`,
      batchId: batch._id,
      currentAcademicYearId: currentYear._id,
      currentSemesterId: currentSemester._id,
      status: 'ACTIVE',
    };
  });
  console.log(`Inserting ${contextDocs.length} academic contexts…`);
  await insertChunks(StudentAcademicContext, contextDocs);

  const resultDocs = [];
  const ecaDocs = [];
  const histYear = years[0];
  const histSemester = semesters.find(
    (row) => String(row.academicYearId) === String(histYear._id) && row.sequence === 1,
  );
  for (let i = 0; i < students.length; i += 1) {
    const student = students[i];
    const reg = `SEU/IS/22/ICT/S${String(i + 1).padStart(4, '0')}`;
    const subjectCount = 3 + (i % 4);
    for (let s = 0; s < subjectCount; s += 1) {
      const subject = subjects[s];
      const grade = GRADES[(i + s) % GRADES.length];
      const resultId = new mongoose.Types.ObjectId();
      resultDocs.push({
        _id: resultId,
        departmentId: department._id,
        studentUserId: student._id,
        registrationNumber: reg,
        subjectId: subject._id,
        subjectCode: subject.code,
        studentAcademicYearId: histYear._id,
        studentSemesterId: histSemester._id,
        resultCode: grade,
        version: 1,
        isEca: grade === 'E(CA)',
        committedByUserId: admin._id,
      });
      if (grade === 'E(CA)' && ecaDocs.length < 250) {
        ecaDocs.push({
          studentUserId: student._id,
          registrationNumber: reg,
          subjectId: subject._id,
          subjectCode: subject.code,
          academicYearId: histYear._id,
          semesterId: histSemester._id,
          academicResultId: resultId,
          departmentId: department._id,
          status: 'OPEN',
          detectedAt: now,
        });
      }
    }
  }
  console.log(`Inserting ${resultDocs.length} results and ${ecaDocs.length} E(CA) conditions…`);
  await insertChunks(AcademicResult, resultDocs);
  if (ecaDocs.length) {
    await insertChunks(IncompleteCa, ecaDocs);
  }

  const noticeDocs = [];
  for (let i = 1; i <= 40; i += 1) {
    noticeDocs.push({
      title:
        i % 5 === 0
          ? `Scale notice ${i}: Extremely long announcement title for wrapping and truncation validation in the notices list`
          : `Scale notice ${i}`,
      body: `Synthetic notice body ${i}. This is fictional content for UI stress testing only.`,
      departmentId: department._id,
      publisherUserId: admin._id,
      publicationState: 'PUBLISHED',
      publishedAt: new Date(now.getTime() - i * 3600_000),
      targeting: { kind: 'ALL_STUDENTS' },
      priority: i % 9 === 0 ? 'HIGH' : 'NORMAL',
    });
  }
  try {
    await Notice.insertMany(noticeDocs);
  } catch (error) {
    console.warn('Notice insert skipped/partial:', error.message);
  }

  const eventDocs = [];
  for (let i = 1; i <= 80; i += 1) {
    eventDocs.push({
      title:
        i % 6 === 0
          ? `Scale event ${i}: Long calendar title for multi-day layout checks`
          : `Scale event ${i}`,
      details: 'Synthetic calendar event for UI testing.',
      startsAt: new Date(now.getTime() + i * 6 * 3600_000),
      createdByUserId: admin._id,
      departmentId: department._id,
      eventType: i % 3 === 0 ? 'ASSIGNMENT_DEADLINE' : 'DEPARTMENT',
      publicationState: 'PUBLISHED',
      reminderEnabled: false,
      reminderGeneration: 0,
    });
  }
  await CalendarEvent.insertMany(eventDocs);

  console.log('UI-scale seed complete.');
  console.log(`  Department: ${DEPT_CODE}`);
  console.log(`  Students: ${students.length}`);
  console.log(`  Lecturers: ${lecturers.length}`);
  console.log(`  Offerings: ${offerings.length}`);
  console.log(`  Results: ${resultDocs.length}`);
  console.log(`  Open E(CA): ${ecaDocs.length}`);
  console.log('  Login: scale-admin@scale.example.test /', PASSWORD);
  await disconnectMongo();
}

run().catch(async (error) => {
  console.error('UI-scale seeding failed:', error);
  try {
    await disconnectMongo();
  } catch {
    // ignore
  }
  process.exit(1);
});
