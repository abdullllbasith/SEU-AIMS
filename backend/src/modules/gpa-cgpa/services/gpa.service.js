import { createHash } from 'node:crypto';
import { AcademicResult } from '../../results/models/academic-result.model.js';
import { Subject } from '../../academic-foundation/index.js';
import { GpaSnapshot } from '../models/gpa-snapshot.model.js';
import { calculateWeightedGpa, classifyDegreeByGpa } from './gpa-engine.js';

function fingerprint(items) {
  return createHash('sha256')
    .update(JSON.stringify(items))
    .digest('hex');
}

async function coursesForStudent(studentUserId) {
  const results = await AcademicResult.find({ studentUserId });
  const subjects = await Subject.find({ _id: { $in: results.map((item) => item.subjectId) } });
  const byId = new Map(subjects.map((item) => [String(item._id), item]));
  return results.map((result) => {
    const subject = byId.get(String(result.subjectId));
    return {
      resultId: String(result._id),
      subjectCode: result.subjectCode,
      resultCode: result.resultCode,
      credits: subject?.credits || 0,
      countsForGpa: subject?.countsForGpa !== false,
      academicYearId: result.studentAcademicYearId,
      semesterId: result.studentSemesterId,
    };
  });
}

async function upsertSnapshot(filter, payload) {
  return GpaSnapshot.findOneAndUpdate(
    filter,
    { ...filter, ...payload, calculatedAt: new Date(), engine: 'DICT-SEUSL-GPA-Calculator' },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export async function recalculateStudentGpa(studentUserId) {
  const courses = await coursesForStudent(studentUserId);
  await GpaSnapshot.updateMany({ studentUserId }, { $set: { status: 'STALE' } });

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
      {
        value: calc.gpa,
        status: 'CURRENT',
        credits: calc.credits,
        qualityPoints: calc.qualityPoints,
        inputFingerprint: fingerprint(group),
      },
    );
    semesters.push({
      academicYearId: academicYearId ? String(academicYearId) : null,
      semesterId: semesterId ? String(semesterId) : null,
      gpa: snap.value,
      credits: snap.credits,
      excluded: calc.excluded.map((item) => ({ subjectCode: item.subjectCode, resultCode: item.resultCode, reason: item.reason })),
    });
  }

  const cumulative = calculateWeightedGpa(courses);
  const overall = await GpaSnapshot.findOneAndUpdate(
    { studentUserId, scope: 'CUMULATIVE' },
    {
      studentUserId,
      scope: 'CUMULATIVE',
      academicYearId: null,
      semesterId: null,
      value: cumulative.gpa,
      status: 'CURRENT',
      credits: cumulative.credits,
      qualityPoints: cumulative.qualityPoints,
      classification: classifyDegreeByGpa(cumulative.gpa),
      inputFingerprint: fingerprint(courses),
      calculatedAt: new Date(),
      engine: 'DICT-SEUSL-GPA-Calculator',
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
    semesters,
    excluded: cumulative.excluded.map((item) => ({
      subjectCode: item.subjectCode,
      resultCode: item.resultCode,
      reason: item.reason,
    })),
  };
}

export async function getStudentGpaSummary(studentUserId) {
  const overall = await GpaSnapshot.findOne({ studentUserId, scope: 'CUMULATIVE' });
  if (!overall || overall.status === 'STALE') {
    return recalculateStudentGpa(studentUserId);
  }
  const semesters = await GpaSnapshot.find({ studentUserId, scope: 'SEMESTER' }).sort({ updatedAt: 1 });
  return {
    gpa: overall.value,
    cgpa: overall.value,
    credits: overall.credits,
    classification: overall.classification,
    status: overall.status,
    engine: overall.engine,
    semesters: semesters.map((item) => ({
      academicYearId: item.academicYearId ? String(item.academicYearId) : null,
      semesterId: item.semesterId ? String(item.semesterId) : null,
      gpa: item.value,
      credits: item.credits,
    })),
  };
}
