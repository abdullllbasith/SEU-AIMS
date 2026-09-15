import { AcademicResult } from '../models/academic-result.model.js';
import { ResultRevision } from '../models/result-revision.model.js';
import { findStudentContextByUserId } from '../../academic-foundation/index.js';
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

  const attach = (items) =>
    items.map((item) => ({
      ...mapStudentResult(item),
      revisions: historyByResult.get(String(item._id)) || [],
    }));

  return {
    current: attach(current),
    history: attach(history),
    all: attach(results),
  };
}
