import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { startIsolatedMongo, stopIsolatedMongo, clearIsolatedMongo } from '../helpers/memory-mongo.js';
import { registerModels } from '../../src/infrastructure/database/register-models.js';
import { CurriculumMapping } from '../../src/modules/academic-foundation/models/curriculum-mapping.model.js';
import { ensureCurriculumMappingIndex } from '../../src/modules/academic-foundation/models/ensure-curriculum-index.js';

const INDEX_NAME = 'departmentId_1_subjectId_1_academicYearId_1_semesterId_1_specialization_1';

let mongoReady = false;

before(async () => {
  try {
    await startIsolatedMongo();
    mongoReady = true;
  } catch (error) {
    process.stderr.write(`Skipping curriculum index tests: ${error.message}\n`);
  }
});

after(async () => {
  if (mongoReady) {
    await stopIsolatedMongo();
  }
});

beforeEach(async () => {
  if (mongoReady) {
    await clearIsolatedMongo();
  }
});

function dbTest(name, fn) {
  test(name, async (t) => {
    if (!mongoReady) {
      t.skip('Isolated MongoDB is not available in this environment');
      return;
    }
    await fn();
  });
}

function identity() {
  return {
    departmentId: new mongoose.Types.ObjectId(),
    subjectId: new mongoose.Types.ObjectId(),
    academicYearId: new mongoose.Types.ObjectId(),
    semesterId: new mongoose.Types.ObjectId(),
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function dropUniqueIndex() {
  const indexes = await CurriculumMapping.collection.indexes();
  if (indexes.some((item) => item.name === INDEX_NAME)) {
    await CurriculumMapping.collection.dropIndex(INDEX_NAME);
  }
}

dbTest('model registration includes CurriculumMapping and startup verifies its unique index', async () => {
  const models = registerModels();
  assert.equal(models.CurriculumMapping, CurriculumMapping);
  await dropUniqueIndex();
  const index = await ensureCurriculumMappingIndex();
  assert.equal(index.name, INDEX_NAME);
  assert.equal(index.unique, true);
  assert.deepEqual(index.key, {
    departmentId: 1,
    subjectId: 1,
    academicYearId: 1,
    semesterId: 1,
    specialization: 1,
  });
});

dbTest('duplicate curriculum identities stop index creation and leave the documents unchanged', async () => {
  await dropUniqueIndex();
  const row = identity();
  await CurriculumMapping.collection.insertMany([
    { ...row },
    { ...row, status: 'ARCHIVED' },
  ]);
  await assert.rejects(() => ensureCurriculumMappingIndex(), /duplicate identities already exist/);
  const stored = await CurriculumMapping.collection.find({ departmentId: row.departmentId }).toArray();
  assert.equal(stored.length, 2);
  assert.deepEqual(
    stored.map((item) => item.status).sort(),
    ['ACTIVE', 'ARCHIVED'],
  );
  const indexes = await CurriculumMapping.collection.indexes();
  assert.equal(indexes.some((item) => item.name === INDEX_NAME), false);
});
