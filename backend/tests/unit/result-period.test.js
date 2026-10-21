import assert from 'node:assert/strict';
import test from 'node:test';
import { selectResultPeriods } from '../../src/modules/results/services/result-period.js';

const batch = { _id: 'batch-22', code: '22ICT', name: '22 ICT' };
const year = { _id: 'year-2', name: 'Year 2', sequence: 2 };
const semester = { _id: 'sem-1', name: 'Semester 1 Y2', sequence: 1, academicYearId: 'year-2' };

test('a sheet of one batch and one curriculum semester is labeled once', () => {
  const periods = selectResultPeriods({
    rows: [
      { subjectId: 'sub-a', matchedStudentUserId: 'student-1' },
      { subjectId: 'sub-b', matchedStudentUserId: 'student-1' },
    ],
    studentBatchByUserId: new Map([['student-1', 'batch-22']]),
    mappings: [
      { subjectId: 'sub-a', academicYearId: 'year-2', semesterId: 'sem-1' },
      { subjectId: 'sub-b', academicYearId: 'year-2', semesterId: 'sem-1' },
    ],
    batches: [batch],
    years: [year],
    semesters: [semester],
  });

  assert.equal(periods.length, 1);
  assert.equal(periods[0].batchCode, '22ICT');
  assert.equal(periods[0].academicYearName, 'Year 2');
  assert.equal(periods[0].semesterName, 'Semester 1 Y2');
});

test('subjects from two semesters stay as two periods for the same batch', () => {
  const periods = selectResultPeriods({
    rows: [
      { subjectId: 'sub-a', matchedStudentUserId: 'student-1' },
      { subjectId: 'sub-c', matchedStudentUserId: 'student-1' },
    ],
    studentBatchByUserId: new Map([['student-1', 'batch-22']]),
    mappings: [
      { subjectId: 'sub-a', academicYearId: 'year-2', semesterId: 'sem-1' },
      { subjectId: 'sub-c', academicYearId: 'year-2', semesterId: 'sem-2' },
    ],
    batches: [batch],
    years: [year],
    semesters: [
      semester,
      { _id: 'sem-2', name: 'Semester 2', sequence: 2, academicYearId: 'year-2' },
    ],
  });

  assert.deepEqual(
    periods.map((period) => period.semesterSequence),
    [1, 2],
  );
});

test('unmatched rows do not add a second copy of a batch period', () => {
  const periods = selectResultPeriods({
    rows: [
      { subjectId: 'sub-a', matchedStudentUserId: 'student-1' },
      { subjectId: 'sub-a' },
    ],
    studentBatchByUserId: new Map([['student-1', 'batch-22']]),
    mappings: [{ subjectId: 'sub-a', academicYearId: 'year-2', semesterId: 'sem-1' }],
    batches: [batch],
    years: [year],
    semesters: [semester],
  });

  assert.equal(periods.length, 1);
  assert.equal(periods[0].batchCode, '22ICT');
});

test('a subject mapped to several periods uses that batch offering', () => {
  const periods = selectResultPeriods({
    rows: [{ subjectId: 'sub-a', matchedStudentUserId: 'student-1' }],
    studentBatchByUserId: new Map([['student-1', 'batch-22']]),
    mappings: [
      { subjectId: 'sub-a', academicYearId: 'year-2', semesterId: 'sem-1' },
      { subjectId: 'sub-a', academicYearId: 'year-3', semesterId: 'sem-3' },
    ],
    offerings: [{ subjectId: 'sub-a', batchId: 'batch-22', academicYearId: 'year-2', semesterId: 'sem-1' }],
    batches: [batch],
    years: [year, { _id: 'year-3', name: 'Year 3', sequence: 3 }],
    semesters: [semester, { _id: 'sem-3', name: 'Semester 1', sequence: 1, academicYearId: 'year-3' }],
  });

  assert.equal(periods.length, 1);
  assert.equal(periods[0].academicYearName, 'Year 2');
});
