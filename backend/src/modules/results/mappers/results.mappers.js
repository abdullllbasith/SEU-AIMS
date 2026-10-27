import { RESULT_COMMIT_LOCK_MS } from '../constants.js';

const LIVE_IMPORT_STATUSES = new Set(['UPLOADED', 'PROCESSING', 'COMMITTING']);

function mapOperationProgress(doc) {
  if (!LIVE_IMPORT_STATUSES.has(doc.processingStatus)) {
    return null;
  }
  const completed = Math.max(0, Number(doc.operationProgress?.completed) || 0);
  const total = Math.max(0, Number(doc.operationProgress?.total) || 0);
  if (!total) {
    return { completed: 0, total: 0, percent: null };
  }
  const percent = Math.min(99, Math.round((completed / total) * 100));
  return { completed, total, percent };
}

function mapResultPeriod(period) {
  return {
    batchCode: period.batchCode || '',
    batchName: period.batchName || '',
    academicYearName: period.academicYearName || '',
    academicYearSequence: period.academicYearSequence ?? null,
    semesterName: period.semesterName || '',
    semesterSequence: period.semesterSequence ?? null,
  };
}

export function mapImport(doc) {
  if (!doc) {
    return null;
  }
  const committingStartedAt = doc.committingStartedAt ? new Date(doc.committingStartedAt).getTime() : 0;
  const commitStale =
    doc.processingStatus === 'COMMITTING' &&
    (!committingStartedAt || Date.now() - committingStartedAt >= RESULT_COMMIT_LOCK_MS);
  const progress = mapOperationProgress(doc);
  return {
    id: String(doc._id),
    departmentId: String(doc.departmentId),
    fileId: String(doc.fileId),
    sourceType: doc.sourceType,
    processingStatus: doc.processingStatus,
    checksumSha256: doc.checksumSha256 || null,
    originalFilename: doc.originalFilename || '',
    sizeBytes: doc.sizeBytes ?? null,
    parserVersion: doc.parserVersion || null,
    processingAttempt: doc.processingAttempt || 1,
    summary: doc.summary || {},
    duplicateOfImportId: doc.duplicateOfImportId ? String(doc.duplicateOfImportId) : null,
    sourceBatchId: doc.sourceBatchId ? String(doc.sourceBatchId) : null,
    sourceAcademicYearId: doc.sourceAcademicYearId ? String(doc.sourceAcademicYearId) : null,
    sourceSemesterId: doc.sourceSemesterId ? String(doc.sourceSemesterId) : null,
    resultPeriods: Array.isArray(doc.resultPeriods) ? doc.resultPeriods.map(mapResultPeriod) : [],
    commitStale,
    progress,
    committedAt: doc.committedAt || null,
    createdAt: doc.createdAt,
    failureCode: doc.failureCode || null,
  };
}

export function mapImportRow(doc) {
  return {
    id: String(doc._id),
    registrationNumber: doc.registrationNumber,
    subjectCode: doc.subjectCode,
    resultCode: doc.resultCode,
    sourceRegistrationNumber: doc.sourceRegistrationNumber || '',
    sourceSubjectCode: doc.sourceSubjectCode || '',
    sourceResultCode: doc.sourceResultCode || '',
    displayName: doc.displayName || '',
    sourceLocation: doc.sourceLocation || '',
    matchStatus: doc.matchStatus,
    rowStatus: doc.rowStatus,
    validationErrors: doc.validationErrors || [],
    proposedAction: doc.proposedAction,
    isEca: Boolean(doc.isEca),
    rawResultCode: doc.rawResultCode || '',
    officialResultCode: doc.officialResultCode || '',
    gradeCapApplied: Boolean(doc.gradeCapApplied),
    gradeCapReason: doc.gradeCapReason || '',
    reviewRequired: Boolean(doc.reviewRequired),
    explanation: doc.explanation || '',
    matchedStudentUserId: doc.matchedStudentUserId ? String(doc.matchedStudentUserId) : null,
  };
}

export function mapStudentResult(doc) {
  return {
    id: String(doc._id),
    subjectCode: doc.subjectCode,
    resultCode: doc.resultCode,
    isEca: Boolean(doc.isEca),
    version: doc.version,
    academicYearId: String(doc.studentAcademicYearId),
    semesterId: String(doc.studentSemesterId),
    updatedAt: doc.updatedAt,
  };
}
