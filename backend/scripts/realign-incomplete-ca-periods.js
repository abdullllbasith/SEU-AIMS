#!/usr/bin/env node
import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(scriptDir, '../../.env') });
dotenv.config({ path: join(scriptDir, '../.env') });

import { connectMongo, disconnectMongo } from '../src/infrastructure/database/mongo.js';
import { registerModels } from '../src/infrastructure/database/register-models.js';
import { realignIncompleteCaPeriods } from '../src/modules/ca-recovery/services/eca-from-results.js';
import { IncompleteCa } from '../src/modules/ca-recovery/models/incomplete-ca.model.js';
import { AcademicYear } from '../src/modules/academic-foundation/models/academic-year.model.js';
import { Semester } from '../src/modules/academic-foundation/models/semester.model.js';

async function report(registrationNumber) {
  const rows = await IncompleteCa.find({ registrationNumber, status: { $in: ['OPEN', 'IN_APPLICATION'] } }).lean();
  const years = await AcademicYear.find({ _id: { $in: rows.map((row) => row.academicYearId) } }).select('name').lean();
  const semesters = await Semester.find({ _id: { $in: rows.map((row) => row.semesterId) } }).select('name').lean();
  const yearById = new Map(years.map((year) => [String(year._id), year.name]));
  const semesterById = new Map(semesters.map((semester) => [String(semester._id), semester.name]));
  for (const row of rows) {
    console.log(
      `${registrationNumber} ${row.subjectCode}: ${yearById.get(String(row.academicYearId))} · ${semesterById.get(String(row.semesterId))}`,
    );
  }
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }
  await connectMongo({ uri: process.env.MONGODB_URI, serverSelectionTimeoutMS: 20000 });
  registerModels();
  console.log(JSON.stringify(await realignIncompleteCaPeriods()));
  await report('SEU/IS/21/ICT/028');
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
