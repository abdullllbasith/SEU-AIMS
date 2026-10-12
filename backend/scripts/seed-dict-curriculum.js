#!/usr/bin/env node
/**
 * Import DICT catalog subjects + curriculum mappings (Years 1–4, both semesters)
 * and create subject offerings per batch for the matching year/semester periods.
 *
 * Idempotent: re-run skips existing subjects, mappings, and offerings.
 * Does not modify results, GPA, or student records.
 *
 * Usage (from backend/):
 *   node scripts/seed-dict-curriculum.js
 *
 * Env:
 *   SEED_DEPARTMENT_CODE=ICT     — department to update (default: first ACTIVE department)
 *   SEED_OFFERINGS=1             — set 0 to import curriculum only
 *   SEED_OFFERINGS_ALL_PERIODS=1 — offerings for every year/semester (default). Set 0 to use each batch’s current period only.
 *   SEED_ASSIGN_BATCH_CONTEXT=1  — assign Year 1 Semester 1 when a batch has no verified context
 */
import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(scriptDir, '../../.env') });
dotenv.config({ path: join(scriptDir, '../.env') });
import { connectMongo, disconnectMongo } from '../src/infrastructure/database/mongo.js';
import { registerModels } from '../src/infrastructure/database/register-models.js';
import { ensureCurriculumMappingIndex } from '../src/modules/academic-foundation/models/ensure-curriculum-index.js';
import { Department } from '../src/modules/academic-foundation/models/department.model.js';
import { Batch } from '../src/modules/academic-foundation/models/batch.model.js';
import { AcademicYear } from '../src/modules/academic-foundation/models/academic-year.model.js';
import { Semester } from '../src/modules/academic-foundation/models/semester.model.js';
import { CurriculumMapping } from '../src/modules/academic-foundation/models/curriculum-mapping.model.js';
import { SubjectOffering } from '../src/modules/academic-foundation/models/subject-offering.model.js';
import { User } from '../src/modules/authentication/models/user.model.js';
import { commitCatalogImport, previewCatalogImport } from '../src/modules/academic-foundation/services/catalog-import.service.js';
import {
  assignBatchAcademicContext,
  generateBatchOfferings,
} from '../src/modules/academic-foundation/services/academic.service.js';
import { ROLES } from '../src/shared/constants/roles.js';

function envFlag(name, defaultOn = true) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return defaultOn;
  }
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

function duplicateKey(error) {
  return error?.code === 11000;
}

async function resolveDepartment() {
  const code = String(process.env.SEED_DEPARTMENT_CODE || '').trim();
  if (code) {
    const department = await Department.findOne({ code, status: 'ACTIVE' });
    if (!department) {
      throw new Error(`No active department with code ${code}`);
    }
    return department;
  }
  const department = await Department.findOne({ status: 'ACTIVE' }).sort({ createdAt: 1 });
  if (!department) {
    throw new Error('No active department found. Create a department first.');
  }
  return department;
}

async function resolveAdminPrincipal(departmentId) {
  let admin = await User.findOne({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    departmentId,
    accountStatus: 'ACTIVE',
  }).sort({ createdAt: 1 });
  if (!admin) {
    admin = await User.findOne({
      role: ROLES.DEPARTMENT_ADMINISTRATOR,
      accountStatus: 'ACTIVE',
    }).sort({ createdAt: 1 });
  }
  if (!admin) {
    throw new Error('No department administrator account found for catalog import.');
  }
  return {
    userId: admin._id,
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    departmentId,
  };
}

async function loadStartingPeriod(departmentId) {
  const year = await AcademicYear.findOne({ departmentId, sequence: 1, status: 'ACTIVE' });
  if (!year) {
    throw new Error('Year 1 is missing or inactive. Run catalog import first or create Year 1.');
  }
  const semester = await Semester.findOne({
    departmentId,
    academicYearId: year._id,
    sequence: 1,
    status: 'ACTIVE',
  });
  if (!semester) {
    throw new Error('Semester 1 of Year 1 is missing or inactive.');
  }
  return { year, semester };
}

async function ensureBatchContext(principal, batch) {
  if (batch.academicContextVerifiedAt && batch.currentAcademicYearId && batch.currentSemesterId) {
    return batch;
  }
  const { year, semester } = await loadStartingPeriod(batch.departmentId);
  return assignBatchAcademicContext(principal, String(batch._id), {
    currentAcademicYearId: String(year._id),
    currentSemesterId: String(semester._id),
  }).then(() => Batch.findById(batch._id));
}

async function seedOfferingsForPeriod(departmentId, batch, year, semester) {
  const mappings = await CurriculumMapping.find({
    departmentId,
    academicYearId: year._id,
    semesterId: semester._id,
    status: 'ACTIVE',
  }).select('subjectId');
  let created = 0;
  let unchanged = 0;
  for (const mapping of mappings) {
    const identity = {
      departmentId,
      subjectId: mapping.subjectId,
      batchId: batch._id,
      academicYearId: year._id,
      semesterId: semester._id,
    };
    const existing = await SubjectOffering.findOne(identity);
    if (existing) {
      unchanged += 1;
      continue;
    }
    try {
      await SubjectOffering.create({ ...identity, status: 'ACTIVE' });
      created += 1;
    } catch (error) {
      if (duplicateKey(error)) {
        unchanged += 1;
        continue;
      }
      throw error;
    }
  }
  return { created, unchanged, mappingCount: mappings.length };
}

async function seedOfferings(principal, departmentId, { allPeriods }) {
  const batches = await Batch.find({ departmentId, status: 'ACTIVE' }).sort({ code: 1 });
  if (!batches.length) {
    console.log('No active batches; skipped offerings.');
    return { batches: 0, offeringsCreated: 0, offeringsUnchanged: 0 };
  }

  const years = await AcademicYear.find({ departmentId, status: 'ACTIVE' }).sort({ sequence: 1 });
  const semesters = await Semester.find({ departmentId, status: 'ACTIVE' });
  const semesterByYear = new Map();
  for (const semester of semesters) {
    const key = String(semester.academicYearId);
    if (!semesterByYear.has(key)) {
      semesterByYear.set(key, []);
    }
    semesterByYear.get(key).push(semester);
  }
  for (const list of semesterByYear.values()) {
    list.sort((left, right) => left.sequence - right.sequence);
  }

  let offeringsCreated = 0;
  let offeringsUnchanged = 0;

  for (const batch of batches) {
    let current = batch;
    if (envFlag('SEED_ASSIGN_BATCH_CONTEXT', true)) {
      current = await ensureBatchContext(principal, batch);
    } else if (!current.academicContextVerifiedAt) {
      console.log(`Skipping batch ${batch.code}: no verified academic context.`);
      continue;
    }

    if (!allPeriods) {
      const result = await generateBatchOfferings(principal, String(current._id));
      offeringsCreated += result.created;
      offeringsUnchanged += result.alreadyExisted;
      console.log(
        `Batch ${current.code}: ${result.created} offerings created, ${result.alreadyExisted} already existed (${result.skipped} curriculum rows skipped for specialization).`,
      );
      continue;
    }

    for (const year of years) {
      const periodSemesters = semesterByYear.get(String(year._id)) || [];
      for (const semester of periodSemesters) {
        const { created, unchanged, mappingCount } = await seedOfferingsForPeriod(
          departmentId,
          current,
          year,
          semester,
        );
        offeringsCreated += created;
        offeringsUnchanged += unchanged;
        if (created) {
          console.log(
            `Batch ${current.code} · ${year.name} · Semester ${semester.sequence}: ${created} new offerings (${mappingCount} curriculum rows).`,
          );
        }
      }
    }
  }

  return { batches: batches.length, offeringsCreated, offeringsUnchanged };
}

async function run() {
  if (process.env.NODE_ENV === 'production') {
    process.stderr.write('Refusing to seed curriculum/offerings in production.\n');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/seu_aims';
  console.log('Connecting to Mongo…');
  await connectMongo({ uri });
  registerModels();
  await ensureCurriculumMappingIndex();

  const code = String(process.env.SEED_DEPARTMENT_CODE || '').trim();
  const departments = code
    ? [await resolveDepartment()]
    : await Department.find({ status: 'ACTIVE' }).sort({ createdAt: 1 });
  if (!departments.length) {
    throw new Error('No active department found. Create a department first.');
  }

  for (const department of departments) {
    console.log(`\nDepartment: ${department.code} — ${department.name}`);
    const principal = await resolveAdminPrincipal(department._id);
    const preview = await previewCatalogImport(principal);
    const blocked = preview.mappings?.blocked || 0;
    console.log(
      `Preview: ${preview.subjects.create} subjects to add, ${preview.mappings.create} mappings to add, ${blocked} mappings blocked, ${preview.ambiguousMappings?.length || 0} ambiguous.`,
    );
    if (preview.ambiguousMappings?.length) {
      const reasons = {};
      for (const item of preview.ambiguousMappings) {
        reasons[item.reason] = (reasons[item.reason] || 0) + 1;
      }
      console.log(`Ambiguous mapping reasons: ${JSON.stringify(reasons)}`);
    }
    console.log('Importing DICT catalog (subjects + curriculum mappings for Years 1–4)…');
    const imported = await commitCatalogImport(principal);
    console.log(
      `Catalog: +${imported.summary.subjectsCreated} subjects, +${imported.summary.mappingsCreated} mappings (${imported.summary.subjectsUnchanged} subjects unchanged, ${imported.summary.mappingsUnchanged} mappings unchanged).`,
    );
    const storedMappings = await CurriculumMapping.countDocuments({ departmentId: department._id });
    console.log(`Curriculum rows now stored: ${storedMappings}`);

    if (!envFlag('SEED_OFFERINGS', true)) {
      console.log('SEED_OFFERINGS=0 — curriculum only, no offerings created.');
      continue;
    }

    const allPeriods = envFlag('SEED_OFFERINGS_ALL_PERIODS', true);
    console.log(
      allPeriods
        ? 'Creating offerings for every active year/semester on each batch…'
        : 'Creating offerings for each batch’s current period only…',
    );
    const offeringSummary = await seedOfferings(principal, department._id, { allPeriods });
    const storedOfferings = await SubjectOffering.countDocuments({ departmentId: department._id });
    console.log(
      `Offerings: ${offeringSummary.offeringsCreated} created, ${offeringSummary.offeringsUnchanged} already existed across ${offeringSummary.batches} batch(es). Stored total: ${storedOfferings}.`,
    );
  }

  await disconnectMongo();
  console.log('Done.');
}

run().catch(async (error) => {
  console.error('Seed failed:', error);
  try {
    await disconnectMongo();
  } catch {
    // ignore
  }
  process.exit(1);
});
