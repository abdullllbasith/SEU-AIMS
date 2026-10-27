#!/usr/bin/env node
/**
 * Replace common Year 3 and Year 4 curriculum rows with the catalog SWT/NST mapping.
 *
 * Usage (from backend/):
 *   node scripts/realign-specialized-curriculum.js
 */
import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(scriptDir, '../../.env') });
dotenv.config({ path: join(scriptDir, '../.env') });

import { connectMongo, disconnectMongo } from '../src/infrastructure/database/mongo.js';
import { registerModels } from '../src/infrastructure/database/register-models.js';
import { realignSpecializedCurriculum } from '../src/modules/academic-foundation/services/realign-specialized-curriculum.js';
import { StudentAcademicContext } from '../src/modules/academic-foundation/models/student-academic-context.model.js';
import { SubjectOffering } from '../src/modules/academic-foundation/models/subject-offering.model.js';
import { CurriculumMapping } from '../src/modules/academic-foundation/models/curriculum-mapping.model.js';
import { filterOfferingsForSpecialization } from '../src/modules/academic-foundation/services/student-specialization.service.js';

async function report(registrationNumber) {
  const context = await StudentAcademicContext.findOne({ registrationNumber }).lean();
  if (!context) {
    console.log(`No student context for ${registrationNumber}`);
    return;
  }
  const offerings = await SubjectOffering.find({
    departmentId: context.departmentId,
    batchId: context.batchId,
    academicYearId: context.currentAcademicYearId,
    semesterId: context.currentSemesterId,
    status: 'ACTIVE',
  }).populate('subjectId', 'code name');
  const visible = await filterOfferingsForSpecialization(offerings, context.specialization || null);
  const codes = visible
    .map((offering) => offering.subjectId?.code)
    .filter(Boolean)
    .sort();
  console.log(`${registrationNumber} ${context.specialization || 'unset'}: ${codes.length} current offerings`);
  console.log(codes.join(', '));
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }
  await connectMongo({ uri: process.env.MONGODB_URI, serverSelectionTimeoutMS: 20000 });
  registerModels();
  const summary = await realignSpecializedCurriculum();
  console.log(JSON.stringify(summary));
  await report('SEU/IS/21/ICT/028');
  const swt = await StudentAcademicContext.findOne({ registrationNumber: 'SEU/IS/21/ICT/027' }).select('specialization').lean();
  if (swt) {
    await report('SEU/IS/21/ICT/027');
  }
  const activeCommon = await CurriculumMapping.countDocuments({ specialization: null, status: 'ACTIVE' });
  console.log(`active common mappings remaining: ${activeCommon}`);
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
