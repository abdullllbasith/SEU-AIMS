import { AcademicResult } from '../models/academic-result.model.js';
import { ResultRevision } from '../models/result-revision.model.js';
import { AcademicYear, Semester, findStudentContextByUserId } from '../../academic-foundation/index.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';
import { mapStudentResult } from '../mappers/results.mappers.js';

export async function getOwnResults(principal, query = {}) {
  if (!principal || principal.role !== ROLES.STUDENT) {
    throw new ForbiddenError('Forbidden');
  }
  if (query.studentId && String(query.studentId) !== String(principal.userId)) {
    throw new ForbiddenError('Forbidden');
  }

  const context = await findStudentContextByUserId(principal.userId);
  const results = await AcademicResult.find({ studentUserId: principal.userId }).sort({ subjectCode: 1 });
  const current = context
    ? results.filter(
        (item) =>
          String(item.studentAcademicYearId) === String(context.currentAcademicYearId) &&
          String(item.studentSemesterId) === String(context.currentSemesterId),
      )
    : results;
  const history = context
    ? results.filter(
        (item) =>
          String(item.studentAcademicYearId) !== String(context.currentAcademicYearId) ||
          String(item.studentSemesterId) !== String(context.currentSemesterId),
      )
    : [];

  const resultIds = results.map((item) => item._id);
  const revisions = await ResultRevision.find({ academicResultId: { $in: resultIds } }).sort({ createdAt: 1 });
  const historyByResult = new Map();
  for (const revision of revisions) {
    const key = String(revision.academicResultId);
    if (!historyByResult.has(key)) {
      historyByResult.set(key, []);
    }
    historyByResult.get(key).push({
      previousResultCode: revision.previousResultCode,
      newResultCode: revision.newResultCode,
      at: revision.createdAt,
    });
  }

  const yearIds = [...new Set(results.map((item) => String(item.studentAcademicYearId || '')).filter(Boolean))];
  const semesterIds = [...new Set(results.map((item) => String(item.studentSemesterId || '')).filter(Boolean))];
  const [years, semesters] = await Promise.all([
    yearIds.length ? AcademicYear.find({ _id: { $in: yearIds } }).select('name sequence').lean() : [],
    semesterIds.length
      ? Semester.find({ _id: { $in: semesterIds } }).select('name sequence academicYearId').lean()
      : [],
  ]);
  const yearById = new Map(years.map((year) => [String(year._id), year]));
  const semesterById = new Map(semesters.map((semester) => [String(semester._id), semester]));

  const attach = (items) =>
    items.map((item) => {
      const year = yearById.get(String(item.studentAcademicYearId || ''));
      const semester = semesterById.get(String(item.studentSemesterId || ''));
      return {
        ...mapStudentResult(item),
        academicYearName: year?.name || '',
        academicYearSequence: year?.sequence ?? null,
        semesterName: semester?.name || '',
        semesterSequence: semester?.sequence ?? null,
        revisions: historyByResult.get(String(item._id)) || [],
      };
    });

  const all = attach(results);
  const periods = new Map();
  for (const row of all) {
    const key = `${row.academicYearId}|${row.semesterId}`;
    if (!periods.has(key)) {
      periods.set(key, {
        academicYearId: row.academicYearId,
        semesterId: row.semesterId,
        academicYearName: row.academicYearName,
        academicYearSequence: row.academicYearSequence,
        semesterName: row.semesterName,
        semesterSequence: row.semesterSequence,
        current:
          context &&
          String(row.academicYearId) === String(context.currentAcademicYearId) &&
          String(row.semesterId) === String(context.currentSemesterId),
        results: [],
      });
    }
    periods.get(key).results.push(row);
  }

  return {
    current: attach(current),
    history: attach(history),
    all,
    periods: [...periods.values()].sort((left, right) => {
      const yearDelta = (left.academicYearSequence ?? 99) - (right.academicYearSequence ?? 99);
      if (yearDelta) {
        return yearDelta;
      }
      return (left.semesterSequence ?? 99) - (right.semesterSequence ?? 99);
    }),
  };
}
