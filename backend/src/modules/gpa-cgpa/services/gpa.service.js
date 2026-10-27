import { createHash } from 'node:crypto';
import { AcademicResult } from '../../results/models/academic-result.model.js';
import { isRecognizedNonGrade } from '../../results/services/normalize.js';
import { Subject } from '../../academic-foundation/index.js';
import { GpaSnapshot } from '../models/gpa-snapshot.model.js';
import {
  GPA_CALCULATION_VERSION,
  calculateWeightedGpa,
  classifyDegreeByGpa,
  gradePointFor,
  round2,
} from './gpa-engine.js';
import { recordAudit as persistAudit } from '../../audit-security/services/record-audit.service.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';

function canonicalInputs(courses) {
  return [...courses]
    .sort((left, right) => `${left.subjectCode}|${left.resultId}`.localeCompare(`${right.subjectCode}|${right.resultId}`))
    .map((course) => ({
      resultId: course.resultId,
      version: course.resultVersion,
      subjectCode: course.subjectCode,
      resultCode: course.resultCode,
      credits: course.credits,
      countsForGpa: course.countsForGpa,
      academicYearId: course.academicYearId ? String(course.academicYearId) : '',
      semesterId: course.semesterId ? String(course.semesterId) : '',
    }));
}

function fingerprint(items) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalInputs(items)))
    .digest('hex');
}

function excludedView(items) {
  return items.map((item) => ({
    subjectCode: item.subjectCode,
    resultCode: item.resultCode,
    reason: item.reason,
  }));
}

async function coursesForStudent(studentUserId) {
  const results = await AcademicResult.find({ studentUserId });
  const subjects = await Subject.find({ _id: { $in: results.map((item) => item.subjectId) } });
  const byId = new Map(subjects.map((item) => [String(item._id), item]));
  return results.map((result) => {
    const subject = byId.get(String(result.subjectId));
    return {
      resultId: String(result._id),
      resultVersion: result.version,
      subjectCode: result.subjectCode,
      resultCode: result.resultCode,
      credits: subject ? subject.credits : null,
      countsForGpa: subject?.countsForGpa !== false,
      academicYearId: result.studentAcademicYearId,
      semesterId: result.studentSemesterId,
    };
  });
}

async function upsertSnapshot(filter, payload) {
  return GpaSnapshot.findOneAndUpdate(
    filter,
    {
      ...filter,
      ...payload,
      calculatedAt: new Date(),
      engine: 'DICT-SEUSL-GPA-Calculator',
      calculationVersion: GPA_CALCULATION_VERSION,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

function snapshotPayload(calc, courses) {
  const counted = calc.credits > 0 && calc.gpa != null;
  return {
    value: counted ? calc.gpa : null,
    status: counted ? 'CURRENT' : 'UNAVAILABLE',
    credits: calc.credits,
    qualityPoints: calc.qualityPoints,
    classification: counted ? classifyDegreeByGpa(calc.gpa) : null,
    inputFingerprint: fingerprint(courses),
    inputResultVersions: canonicalInputs(courses).map((item) => ({
      resultId: item.resultId,
      version: item.version,
      subjectCode: item.subjectCode,
    })),
    excluded: excludedView(calc.excluded),
  };
}

export async function recalculateStudentGpa(studentUserId) {
  const courses = await coursesForStudent(studentUserId);
  const inputFingerprint = fingerprint(courses);
  const existing = await GpaSnapshot.findOne({ studentUserId, scope: 'CUMULATIVE' });
  if (
    existing &&
    ['CURRENT', 'UNAVAILABLE'].includes(existing.status) &&
    existing.inputFingerprint === inputFingerprint &&
    existing.calculationVersion === GPA_CALCULATION_VERSION
  ) {
    return getStudentGpaSummary(studentUserId);
  }

  const groups = new Map();
  for (const course of courses) {
    const key = `${course.academicYearId}:${course.semesterId}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(course);
  }

  const semesters = [];
  for (const group of groups.values()) {
    const academicYearId = group[0].academicYearId;
    const semesterId = group[0].semesterId;
    const calc = calculateWeightedGpa(group);
    const snap = await upsertSnapshot(
      { studentUserId, scope: 'SEMESTER', academicYearId, semesterId },
      snapshotPayload(calc, group),
    );
    semesters.push({
      academicYearId: academicYearId ? String(academicYearId) : null,
      semesterId: semesterId ? String(semesterId) : null,
      gpa: snap.value,
      credits: snap.credits,
      status: snap.status,
      excluded: calc.excluded.map((item) => ({ subjectCode: item.subjectCode, resultCode: item.resultCode, reason: item.reason })),
    });
  }

  const storedSemesters = await GpaSnapshot.find({ studentUserId, scope: 'SEMESTER' }).select(
    'academicYearId semesterId',
  );
  for (const stored of storedSemesters) {
    const stillCounted = semesters.some(
      (item) =>
        String(item.academicYearId) === String(stored.academicYearId) &&
        String(item.semesterId) === String(stored.semesterId),
    );
    if (!stillCounted) {
      await GpaSnapshot.deleteOne({ _id: stored._id });
    }
  }

  const cumulative = calculateWeightedGpa(courses);
  const overallPayload = snapshotPayload(cumulative, courses);
  const overall = await GpaSnapshot.findOneAndUpdate(
    { studentUserId, scope: 'CUMULATIVE' },
    {
      studentUserId,
      scope: 'CUMULATIVE',
      academicYearId: null,
      semesterId: null,
      ...overallPayload,
      calculatedAt: new Date(),
      engine: 'DICT-SEUSL-GPA-Calculator',
      calculationVersion: GPA_CALCULATION_VERSION,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return {
    gpa: overall.value,
    cgpa: overall.value,
    credits: overall.credits,
    classification: overall.classification,
    status: overall.status,
    engine: overall.engine,
    calculationVersion: overall.calculationVersion,
    calculatedAt: overall.calculatedAt,
    semesters: semesters.filter((item) => item.status === 'CURRENT' && item.gpa != null),
    excluded: excludedView(cumulative.excluded),
  };
}

export async function getStudentGpaSummary(studentUserId) {
  const overall = await GpaSnapshot.findOne({ studentUserId, scope: 'CUMULATIVE' });
  if (!overall) {
    return {
      gpa: null,
      cgpa: null,
      credits: 0,
      classification: null,
      status: 'UNAVAILABLE',
      engine: 'DICT-SEUSL-GPA-Calculator',
      calculationVersion: GPA_CALCULATION_VERSION,
      semesters: [],
      excluded: [],
    };
  }
  const courses = await coursesForStudent(studentUserId);
  const currentFingerprint = fingerprint(courses);
  const matches =
    overall.inputFingerprint === currentFingerprint && overall.calculationVersion === GPA_CALCULATION_VERSION;
  if (!matches || overall.status === 'FAILED') {
    return {
      gpa: null,
      cgpa: null,
      credits: 0,
      classification: null,
      status: 'STALE',
      engine: overall.engine,
      calculationVersion: overall.calculationVersion || null,
      calculatedAt: overall.calculatedAt,
      semesters: [],
      excluded: [],
    };
  }
  const semesters = await GpaSnapshot.find({ studentUserId, scope: 'SEMESTER', status: 'CURRENT' }).sort({ updatedAt: 1 });
  return {
    gpa: overall.value,
    cgpa: overall.value,
    credits: overall.credits,
    classification: overall.classification,
    status: overall.status,
    engine: overall.engine,
    calculationVersion: overall.calculationVersion,
    calculatedAt: overall.calculatedAt,
    semesters: semesters
      .filter((item) => item.value != null)
      .map((item) => ({
        academicYearId: item.academicYearId ? String(item.academicYearId) : null,
        semesterId: item.semesterId ? String(item.semesterId) : null,
        gpa: item.value,
        credits: item.credits,
        status: item.status,
      })),
    excluded: overall.excluded || [],
  };
}

function assertAdmin(principal) {
  if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR || !principal.departmentId) {
    throw new ForbiddenError('Forbidden');
  }
}

async function departmentStudentIds(departmentId) {
  return AcademicResult.distinct('studentUserId', { departmentId });
}

const MIN_VERIFIED_CGPA_SAMPLE = 5;

export async function getDepartmentGpaQuality(principal) {
  assertAdmin(principal);
  const studentIds = await departmentStudentIds(principal.departmentId);
  let current = 0;
  let unavailable = 0;
  let stale = 0;
  let missingSnapshot = 0;
  const verifiedCgpaValues = [];
  const classificationCounts = new Map();
  for (const studentUserId of studentIds) {
    const overall = await GpaSnapshot.findOne({ studentUserId, scope: 'CUMULATIVE' });
    if (!overall) {
      missingSnapshot += 1;
      continue;
    }
    const hash = fingerprint(await coursesForStudent(studentUserId));
    const fresh =
      overall.inputFingerprint === hash &&
      overall.calculationVersion === GPA_CALCULATION_VERSION &&
      overall.status !== 'FAILED';
    if (!fresh) {
      stale += 1;
    } else if (overall.status === 'UNAVAILABLE') {
      unavailable += 1;
    } else {
      current += 1;
      if (typeof overall.value === 'number' && Number.isFinite(overall.value)) {
        verifiedCgpaValues.push(overall.value);
        const band = overall.classification || classifyDegreeByGpa(overall.value);
        if (band) {
          classificationCounts.set(band, (classificationCounts.get(band) || 0) + 1);
        }
      }
    }
  }
  const results = await AcademicResult.find({ departmentId: principal.departmentId }).select('resultCode subjectId isEca');
  const subjects = await Subject.find({ _id: { $in: results.map((item) => item.subjectId) } }).select('credits');
  const subjectIds = new Set(subjects.map((item) => String(item._id)));
  let unknownGradeRows = 0;
  let missingSubjectRows = 0;
  for (const result of results) {
    if (!subjectIds.has(String(result.subjectId))) {
      missingSubjectRows += 1;
    }
    if (!isRecognizedNonGrade(result.resultCode) && gradePointFor(result.resultCode) == null) {
      unknownGradeRows += 1;
    }
  }
  const verifiedSampleSize = verifiedCgpaValues.length;
  const insightsReady = verifiedSampleSize >= MIN_VERIFIED_CGPA_SAMPLE;
  const averageCgpa = insightsReady
    ? round2(verifiedCgpaValues.reduce((sum, value) => sum + value, 0) / verifiedSampleSize)
    : null;
  const classificationDistribution = insightsReady
    ? [...classificationCounts.entries()]
        .map(([classification, count]) => ({ classification, count }))
        .sort((left, right) => right.count - left.count || left.classification.localeCompare(right.classification))
    : [];
  return {
    calculationVersion: GPA_CALCULATION_VERSION,
    studentsWithResults: studentIds.length,
    current,
    unavailable,
    stale,
    missingSnapshot,
    unknownGradeRows,
    missingSubjectRows,
    insights: {
      verifiedSampleSize,
      minimumSampleSize: MIN_VERIFIED_CGPA_SAMPLE,
      averageCgpa,
      classificationDistribution,
      ready: insightsReady,
    },
    definitions: {
      current: 'Cumulative snapshot matches current official result versions and the calculation version.',
      stale: 'Stored snapshot does not match current official inputs, or the calculation failed. The student API does not present that number as current.',
      unavailable: 'Snapshot is current and no counted credits remain, so no GPA number is stored.',
      unknownGradeRows: 'Official result codes outside the DICT grade map and not E(CA). They are excluded from the average and are not assigned a grade point.',
      averageCgpa:
        'Mean of verified current cumulative GPA snapshots only. Shown when at least five verified numeric snapshots exist. Individual student values are never exposed.',
    },
  };
}

export async function rebuildDepartmentGpa(principal) {
  assertAdmin(principal);
  const studentIds = await departmentStudentIds(principal.departmentId);
  let calculated = 0;
  let failed = 0;
  for (const studentUserId of studentIds) {
    try {
      await recalculateStudentGpa(studentUserId);
      calculated += 1;
    } catch {
      failed += 1;
    }
  }
  await persistAudit({
    actorUserId: principal.userId,
    action: 'gpa.rebuild',
    entityType: 'GpaSnapshot',
    entityId: principal.departmentId,
    departmentId: principal.departmentId,
    metadata: { students: studentIds.length, calculated, failed, calculationVersion: GPA_CALCULATION_VERSION },
  });
  return { students: studentIds.length, calculated, failed, calculationVersion: GPA_CALCULATION_VERSION };
}
