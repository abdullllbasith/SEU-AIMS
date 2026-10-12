import { CurriculumMapping } from './curriculum-mapping.model.js';

export const CURRICULUM_MAPPING_UNIQUE_INDEX = {
  departmentId: 1,
  subjectId: 1,
  academicYearId: 1,
  semesterId: 1,
  specialization: 1,
};

const INDEX_NAME = 'departmentId_1_subjectId_1_academicYearId_1_semesterId_1_specialization_1';
const PREVIOUS_INDEX_NAME = 'departmentId_1_subjectId_1_academicYearId_1_semesterId_1';

function identityLabel(group) {
  const key = group._id || {};
  return [
    `departmentId=${key.departmentId}`,
    `subjectId=${key.subjectId}`,
    `academicYearId=${key.academicYearId}`,
    `semesterId=${key.semesterId}`,
    `specialization=${key.specialization || ''}`,
    `documentIds=${(group.ids || []).map(String).join(',')}`,
  ].join(' ');
}

export async function findDuplicateCurriculumMappings() {
  return CurriculumMapping.aggregate([
    {
      $group: {
        _id: {
          departmentId: '$departmentId',
          subjectId: '$subjectId',
          academicYearId: '$academicYearId',
          semesterId: '$semesterId',
          specialization: '$specialization',
        },
        ids: { $push: '$_id' },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);
}

function duplicateMessage(duplicates) {
  const lines = duplicates.map(identityLabel).join('\n');
  return [
    'Curriculum mapping unique index was not created because duplicate identities already exist.',
    'Each department, subject, academic year, semester, and specialization may appear only once, including archived mappings.',
    'Keep one document for each identity and remove the extra documents manually. No records were changed.',
    lines,
  ].join('\n');
}

export async function ensureCurriculumMappingIndex({ logger } = {}) {
  const duplicates = await findDuplicateCurriculumMappings();
  if (duplicates.length) {
    throw new Error(duplicateMessage(duplicates));
  }

  const existing = await CurriculumMapping.collection.indexes();
  if (existing.some((item) => item.name === PREVIOUS_INDEX_NAME)) {
    await CurriculumMapping.collection.dropIndex(PREVIOUS_INDEX_NAME);
  }

  await CurriculumMapping.collection.createIndex(CURRICULUM_MAPPING_UNIQUE_INDEX, {
    unique: true,
    name: INDEX_NAME,
  });

  const indexes = await CurriculumMapping.collection.indexes();
  const index = indexes.find((item) => item.name === INDEX_NAME);
  if (!index?.unique) {
    throw new Error(`Curriculum mapping unique index ${INDEX_NAME} is missing after initialization`);
  }
  logger?.info('Curriculum mapping unique index verified', { name: INDEX_NAME });
  return index;
}
