import mongoose from 'mongoose';
import { AcademicResult } from '../models/academic-result.model.js';
import { chooseSubjectPeriod } from './result-period.js';
import {
  AcademicYear,
  CurriculumMapping,
  Semester,
  SubjectOffering,
  StudentAcademicContext,
} from '../../academic-foundation/index.js';
import { recalculateStudentGpa } from '../../gpa-cgpa/services/gpa.service.js';

/**
 * Move stored official results onto the curriculum semester for the student's batch.
 * Rows with no curriculum or offering period are left on their current semester.
 */
export async function realignStoredResultPeriods() {
  const results = await AcademicResult.find()
    .select('studentUserId subjectId subjectOfferingId studentAcademicYearId studentSemesterId departmentId')
    .lean();
  const studentIds = [...new Set(results.map((result) => String(result.studentUserId)))];
  const students = await StudentAcademicContext.find({ userId: { $in: studentIds } })
    .select('userId batchId departmentId')
    .lean();
  const studentByUser = new Map(students.map((student) => [String(student.userId), student]));
  const departmentIds = [...new Set(results.map((result) => String(result.departmentId)))];
  const [mappings, offerings, years, semesters] = await Promise.all([
    CurriculumMapping.find({ departmentId: { $in: departmentIds }, status: 'ACTIVE' })
      .select('departmentId subjectId academicYearId semesterId')
      .lean(),
    SubjectOffering.find({ departmentId: { $in: departmentIds } })
      .select('departmentId subjectId batchId academicYearId semesterId')
      .lean(),
    AcademicYear.find({ departmentId: { $in: departmentIds } }).select('departmentId name sequence').lean(),
    Semester.find({ departmentId: { $in: departmentIds } })
      .select('departmentId name sequence academicYearId')
      .lean(),
  ]);

  const grouped = (rows) => {
    const map = new Map();
    for (const row of rows) {
      const key = String(row.departmentId);
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(row);
    }
    return map;
  };
  const mappingsByDepartment = grouped(mappings);
  const offeringsByDepartment = grouped(offerings);
  const yearsByDepartment = grouped(years);
  const semestersByDepartment = grouped(semesters);

  let moved = 0;
  let alreadyPlaced = 0;
  let unresolved = 0;
  const touched = new Set();
  const operations = [];

  for (const result of results) {
    const student = studentByUser.get(String(result.studentUserId));
    const departmentId = String(result.departmentId);
    if (!student?.batchId) {
      unresolved += 1;
      continue;
    }
    const period = chooseSubjectPeriod({
      subjectId: result.subjectId,
      batchId: student.batchId,
      mappings: mappingsByDepartment.get(departmentId) || [],
      offerings: offeringsByDepartment.get(departmentId) || [],
      years: yearsByDepartment.get(departmentId) || [],
      semesters: semestersByDepartment.get(departmentId) || [],
    });
    if (!period) {
      unresolved += 1;
      continue;
    }
    const sameYear = String(result.studentAcademicYearId) === String(period.academicYearId);
    const sameSemester = String(result.studentSemesterId) === String(period.semesterId);
    const offeringMatches =
      !period.subjectOfferingId || String(result.subjectOfferingId || '') === String(period.subjectOfferingId);
    if (sameYear && sameSemester && offeringMatches) {
      alreadyPlaced += 1;
      continue;
    }
    const update = {
      studentAcademicYearId: new mongoose.Types.ObjectId(period.academicYearId),
      studentSemesterId: new mongoose.Types.ObjectId(period.semesterId),
    };
    if (period.subjectOfferingId) {
      update.subjectOfferingId = new mongoose.Types.ObjectId(period.subjectOfferingId);
    }
    operations.push({
      updateOne: {
        filter: { _id: result._id },
        update: { $set: update },
      },
    });
    moved += 1;
    touched.add(String(result.studentUserId));
  }

  const batchSize = 400;
  for (let index = 0; index < operations.length; index += batchSize) {
    await AcademicResult.bulkWrite(operations.slice(index, index + batchSize), { ordered: false });
  }

  const studentIdsToRecalculate = [...touched];
  let recalculated = 0;
  const workers = Math.min(8, studentIdsToRecalculate.length);
  let cursor = 0;
  async function recalculateNext() {
    while (cursor < studentIdsToRecalculate.length) {
      const studentUserId = studentIdsToRecalculate[cursor];
      cursor += 1;
      await recalculateStudentGpa(studentUserId);
      recalculated += 1;
    }
  }
  if (workers > 0) {
    await Promise.all(Array.from({ length: workers }, () => recalculateNext()));
  }

  return {
    scanned: results.length,
    moved,
    alreadyPlaced,
    unresolved,
    recalculated,
  };
}
