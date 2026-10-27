import {
  AcademicYear,
  Batch,
  CurriculumMapping,
  Semester,
  StudentAcademicContext,
  SubjectOffering,
} from '../../academic-foundation/index.js';

export const RESULT_PERIOD_VERSION = 2;

function id(value) {
  return value == null || value === '' ? '' : String(value);
}

/**
 * Which batch, academic year, and semester a result sheet covers.
 * Year and semester come from the subjects' curriculum period, not the student's current period.
 * A subject mapped once is counted once. Multiple curriculum periods are narrowed with that batch's offering.
 */
export function selectResultPeriods({
  rows = [],
  studentBatchByUserId = new Map(),
  mappings = [],
  offerings = [],
  batches = [],
  years = [],
  semesters = [],
} = {}) {
  const mappingsBySubject = new Map();
  for (const mapping of mappings) {
    const subjectId = id(mapping.subjectId);
    const period = `${id(mapping.academicYearId)}|${id(mapping.semesterId)}`;
    if (!subjectId || period === '|') {
      continue;
    }
    if (!mappingsBySubject.has(subjectId)) {
      mappingsBySubject.set(subjectId, new Set());
    }
    mappingsBySubject.get(subjectId).add(period);
  }

  const offeringsBySubjectBatch = new Map();
  for (const offering of offerings) {
    const key = `${id(offering.subjectId)}|${id(offering.batchId)}`;
    const period = `${id(offering.academicYearId)}|${id(offering.semesterId)}`;
    if (period === '|') {
      continue;
    }
    if (!offeringsBySubjectBatch.has(key)) {
      offeringsBySubjectBatch.set(key, new Set());
    }
    offeringsBySubjectBatch.get(key).add(period);
  }

  const tallies = new Map();
  for (const row of rows) {
    const subjectId = id(row.subjectId);
    const batchId = id(studentBatchByUserId.get(id(row.matchedStudentUserId)));
    const mapped = subjectId ? [...(mappingsBySubject.get(subjectId) || [])] : [];
    let periods = mapped;
    if (batchId && mapped.length !== 1) {
      const offered = [...(offeringsBySubjectBatch.get(`${subjectId}|${batchId}`) || [])];
      const overlap = mapped.length ? offered.filter((period) => mapped.includes(period)) : offered;
      if (overlap.length) {
        periods = overlap;
      }
    }
    if (!periods.length) {
      if (batchId) {
        tallies.set(`${batchId}||`, (tallies.get(`${batchId}||`) || 0) + 1);
      }
      continue;
    }
    for (const period of periods) {
      const key = `${batchId}|${period}`;
      tallies.set(key, (tallies.get(key) || 0) + 1);
    }
  }

  const batchById = new Map(batches.map((batch) => [id(batch._id || batch.id), batch]));
  const yearById = new Map(years.map((year) => [id(year._id || year.id), year]));
  const semesterById = new Map(semesters.map((semester) => [id(semester._id || semester.id), semester]));

  const sorted = [...tallies.keys()]
    .map((key) => {
      const [batchId, academicYearId, semesterId] = key.split('|');
      const batch = batchById.get(batchId);
      const year = yearById.get(academicYearId);
      const semester = semesterById.get(semesterId);
      return {
        batchId: batchId || null,
        batchCode: batch?.code || '',
        batchName: batch?.name || '',
        academicYearId: academicYearId || null,
        academicYearName: year?.name || '',
        academicYearSequence: year?.sequence ?? null,
        semesterId: semesterId || null,
        semesterName: semester?.name || '',
        semesterSequence: semester?.sequence ?? null,
      };
    })
    .filter((period) => period.batchCode || period.batchName || period.academicYearName || period.semesterName)
    .sort((left, right) => {
      const yearDelta = (left.academicYearSequence ?? 99) - (right.academicYearSequence ?? 99);
      if (yearDelta) {
        return yearDelta;
      }
      const semesterDelta = (left.semesterSequence ?? 99) - (right.semesterSequence ?? 99);
      if (semesterDelta) {
        return semesterDelta;
      }
      return String(left.batchCode).localeCompare(String(right.batchCode));
    });
  return withoutDuplicateBatchlessPeriods(sorted);
}

function withoutDuplicateBatchlessPeriods(periods) {
  const covered = new Set(
    periods
      .filter((period) => period.batchCode || period.batchName)
      .map((period) => `${period.academicYearId || ''}|${period.semesterId || ''}`),
  );
  return periods.filter((period) => {
    if (period.batchCode || period.batchName) {
      return true;
    }
    return !covered.has(`${period.academicYearId || ''}|${period.semesterId || ''}`);
  });
}

/**
 * The curriculum period a subject belongs to for a batch.
 * A single curriculum mapping wins. Several mappings are narrowed by that batch's offering.
 * The student's current year and semester are not used.
 */
export function chooseSubjectPeriod({
  subjectId,
  batchId,
  mappings = [],
  offerings = [],
  years = [],
  semesters = [],
} = {}) {
  const subjectKey = id(subjectId);
  const batchKey = id(batchId);
  if (!subjectKey) {
    return null;
  }
  const mapped = [
    ...new Set(
      mappings
        .filter((mapping) => id(mapping.subjectId) === subjectKey)
        .map((mapping) => `${id(mapping.academicYearId)}|${id(mapping.semesterId)}`)
        .filter((period) => period !== '|'),
    ),
  ];
  const offered = [
    ...new Set(
      offerings
        .filter(
          (offering) =>
            id(offering.subjectId) === subjectKey && (!batchKey || id(offering.batchId) === batchKey),
        )
        .map((offering) => `${id(offering.academicYearId)}|${id(offering.semesterId)}`)
        .filter((period) => period !== '|'),
    ),
  ];
  let periods = mapped;
  if (mapped.length !== 1) {
    const overlap = mapped.length ? offered.filter((period) => mapped.includes(period)) : offered;
    if (overlap.length) {
      periods = overlap;
    }
  }
  if (!periods.length) {
    return null;
  }
  const yearById = new Map(years.map((year) => [id(year._id || year.id), year]));
  const semesterById = new Map(semesters.map((semester) => [id(semester._id || semester.id), semester]));
  periods.sort((left, right) => {
    const [leftYearId, leftSemesterId] = left.split('|');
    const [rightYearId, rightSemesterId] = right.split('|');
    const yearDelta =
      (yearById.get(leftYearId)?.sequence ?? 99) - (yearById.get(rightYearId)?.sequence ?? 99);
    if (yearDelta) {
      return yearDelta;
    }
    return (
      (semesterById.get(leftSemesterId)?.sequence ?? 99) -
      (semesterById.get(rightSemesterId)?.sequence ?? 99)
    );
  });
  const [academicYearId, semesterId] = periods[0].split('|');
  const offering = offerings.find(
    (item) =>
      id(item.subjectId) === subjectKey &&
      (!batchKey || id(item.batchId) === batchKey) &&
      id(item.academicYearId) === academicYearId &&
      id(item.semesterId) === semesterId,
  );
  return {
    academicYearId,
    semesterId,
    subjectOfferingId: offering?._id || offering?.id || null,
  };
}

export async function deriveResultPeriods(departmentId, rows = []) {
  const subjectIds = [...new Set(rows.map((row) => row.subjectId).filter(Boolean))];
  const studentIds = [...new Set(rows.map((row) => row.matchedStudentUserId).filter(Boolean))];
  if (!subjectIds.length && !studentIds.length) {
    return [];
  }

  const students = studentIds.length
    ? await StudentAcademicContext.find({ userId: { $in: studentIds } }).select('userId batchId').lean()
    : [];
  const batchIds = [...new Set(students.map((student) => student.batchId).filter(Boolean))];
  const [mappings, offerings, batches, years, semesters] = await Promise.all([
    subjectIds.length
      ? CurriculumMapping.find({ departmentId, subjectId: { $in: subjectIds }, status: 'ACTIVE' })
          .select('subjectId academicYearId semesterId')
          .lean()
      : [],
    subjectIds.length && batchIds.length
      ? SubjectOffering.find({
          departmentId,
          subjectId: { $in: subjectIds },
          batchId: { $in: batchIds },
        })
          .select('subjectId batchId academicYearId semesterId')
          .lean()
      : [],
    batchIds.length ? Batch.find({ _id: { $in: batchIds } }).select('code name').lean() : [],
    AcademicYear.find({ departmentId }).select('name sequence').lean(),
    Semester.find({ departmentId }).select('name sequence academicYearId').lean(),
  ]);

  return selectResultPeriods({
    rows,
    studentBatchByUserId: new Map(students.map((student) => [String(student.userId), String(student.batchId)])),
    mappings,
    offerings,
    batches,
    years,
    semesters,
  });
}
