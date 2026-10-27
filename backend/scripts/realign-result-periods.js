#!/usr/bin/env node
/**
 * Place already committed official results on the curriculum semester for each
 * student's batch, then recalculate GPA for students whose rows moved.
 *
 * Usage (from backend/):
 *   node scripts/realign-result-periods.js
 */
import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(scriptDir, '../../.env') });
dotenv.config({ path: join(scriptDir, '../.env') });

import { connectMongo, disconnectMongo } from '../src/infrastructure/database/mongo.js';
import { registerModels } from '../src/infrastructure/database/register-models.js';
import { realignStoredResultPeriods } from '../src/modules/results/services/realign-result-periods.js';
import { AcademicResult } from '../src/modules/results/models/academic-result.model.js';
import { AcademicYear } from '../src/modules/academic-foundation/models/academic-year.model.js';
import { Semester } from '../src/modules/academic-foundation/models/semester.model.js';
import { StudentAcademicContext } from '../src/modules/academic-foundation/models/student-academic-context.model.js';

const registration = process.argv[2] || 'SEU/IS/22/ICT/024';

async function report(registrationNumber) {
  const student = await StudentAcademicContext.findOne({ registrationNumber }).select('userId').lean();
  if (!student) {
    console.log(`No student context for ${registrationNumber}`);
    return;
  }
  const results = await AcademicResult.find({ studentUserId: student.userId })
    .select('subjectCode studentAcademicYearId studentSemesterId')
    .lean();
  const years = await AcademicYear.find({
    _id: { $in: results.map((row) => row.studentAcademicYearId) },
  })
    .select('name sequence')
    .lean();
  const semesters = await Semester.find({
    _id: { $in: results.map((row) => row.studentSemesterId) },
  })
    .select('name sequence')
    .lean();
  const yearById = new Map(years.map((year) => [String(year._id), year]));
  const semesterById = new Map(semesters.map((semester) => [String(semester._id), semester]));
  const groups = new Map();
  for (const row of results) {
    const year = yearById.get(String(row.studentAcademicYearId));
    const semester = semesterById.get(String(row.studentSemesterId));
    const label = `${year?.name || 'Year ?'} · ${semester?.name || 'Semester ?'}`;
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label).push(row.subjectCode);
  }
  console.log(`${registrationNumber}: ${results.length} official results`);
  for (const [label, codes] of groups) {
    console.log(`  ${label} (${codes.length}): ${codes.sort().join(', ')}`);
  }
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }
  await connectMongo({ uri, serverSelectionTimeoutMS: 20000 });
  await registerModels();
  const summary = await realignStoredResultPeriods();
  console.log(JSON.stringify(summary));
  await report(registration);
  await disconnectMongo();
}

run().catch(async (error) => {
  console.error(error instanceof Error ? error.message : 'Realign failed');
  try {
    await disconnectMongo();
  } catch {
    // already closed
  }
  process.exit(1);
});
