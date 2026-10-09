import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { ResultImport } from '../models/result-import.model.js';
import { ResultImportRow } from '../models/result-import-row.model.js';
import { AcademicResult } from '../models/academic-result.model.js';
import { ResultRevision } from '../models/result-revision.model.js';
import { ECA_RESULT_CODE, RESULT_PARSER_VERSION } from '../constants.js';
import { parseXlsxResults } from './xlsx-parser.js';
import { parsePdfResults } from './pdf-parser.js';
import {
  isKnownGrade,
  looksLikeRegistrationNumber,
  normalizeRegistrationNumber,
  normalizeResultCode,
  normalizeSubjectCode,
} from './normalize.js';
import { actionForExistingResult, blockConflictingIdentities } from './classification.js';
import { mapImport, mapImportRow } from '../mappers/results.mappers.js';
import { parsePagination, requireObjectId } from '../utils/http.js';
import {
  StoredFile,
  enqueueMalwareScan,
  processMalwareScan,
  detectResultImportContentType,
  assertAllowedResultImportType,
  sanitizeDisplayFilename,
} from '../../files/index.js';
import {
  Subject,
  SubjectOffering,
  findStudentByRegistrationNumber,
} from '../../academic-foundation/index.js';
import { JOB_NAMES } from '../../../infrastructure/queue/job-names.js';
import { recordAudit as persistAudit } from '../../audit-security/services/record-audit.service.js';
import { fanoutNotification } from '../../notifications/index.js';
import { ROLES } from '../../../shared/constants/roles.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  ValidationError,
} from '../../../shared/errors/app-error.js';
import { syncIncompleteCaFromResult } from '../../ca-recovery/index.js';
import { recalculateStudentGpa } from '../../gpa-cgpa/services/gpa.service.js';

function assertAdmin(principal) {
  if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR || !principal.departmentId) {
    throw new ForbiddenError('Forbidden');
  }
}

async function recordAudit({ actorUserId, action, entityId, metadata, departmentId }) {
  await persistAudit({
    actorUserId,
    action,
    entityType: 'ResultImport',
    entityId,
    metadata,
    departmentId,
  });
}

async function loadDepartmentImport(principal, importId) {
  assertAdmin(principal);
  requireObjectId(importId, 'import');
  const doc = await ResultImport.findById(importId);
  if (!doc || String(doc.departmentId) !== String(principal.departmentId)) {
    throw new NotFoundError('Result import not found');
  }
  return doc;
}

function summarize(rows) {
  return {
    totalRows: rows.length,
    validRows: rows.filter((row) => row.rowStatus === 'VALID').length,
    blockedRows: rows.filter((row) => row.rowStatus === 'BLOCKED').length,
    matchedStudents: new Set(
      rows.filter((row) => row.matchedStudentUserId).map((row) => String(row.matchedStudentUserId)),
    ).size,
    unmatchedRows: rows.filter((row) => row.matchStatus === 'UNMATCHED').length,
    ecaRows: rows.filter((row) => row.isEca).length,
    updateRows: rows.filter((row) => row.proposedAction === 'UPDATE').length,
    newRows: rows.filter((row) => row.proposedAction === 'NEW').length,
    unchangedRows: rows.filter((row) => row.proposedAction === 'UNCHANGED').length,
    conflictRows: rows.filter((row) => (row.validationErrors || []).includes('INTRA_IMPORT_CONFLICT')).length,
    duplicateRows: rows.filter((row) => (row.validationErrors || []).includes('INTRA_IMPORT_DUPLICATE')).length,
  };
}

async function classifyRow({ importDoc, parsed, seen }) {
  const errors = [];
  const sourceRegistrationNumber = String(parsed.registrationNumber || '').trim();
  const sourceSubjectCode = String(parsed.subjectCode || '').trim();
  const sourceResultCode = String(parsed.resultCode || '').trim();
  const registrationNumber = normalizeRegistrationNumber(sourceRegistrationNumber);
  const subjectCode = normalizeSubjectCode(sourceSubjectCode);
  const resultCode = normalizeResultCode(sourceResultCode);
  const isEca = resultCode === ECA_RESULT_CODE;
  let rowStatus = 'VALID';
  let matchStatus = 'UNMATCHED';
  let proposedAction = 'NEW';
  let matchedStudentUserId = null;
  let subjectId = null;
  let subjectOfferingId = null;

  if (!looksLikeRegistrationNumber(registrationNumber)) {
    errors.push('MALFORMED_REGISTRATION_NUMBER');
    rowStatus = 'BLOCKED';
  }
  if (!subjectCode) {
    errors.push('MISSING_SUBJECT_CODE');
    rowStatus = 'BLOCKED';
  }
  if (!resultCode) {
    errors.push('MISSING_RESULT_CODE');
    rowStatus = 'BLOCKED';
  } else if (!isEca && !isKnownGrade(resultCode)) {
    errors.push('UNKNOWN_RESULT_MARKER');
    rowStatus = 'BLOCKED';
  }

  const identityKey = `${registrationNumber}|${subjectCode}`;
  if (seen.has(identityKey)) {
    const prior = seen.get(identityKey);
    if (prior.resultCode !== resultCode) {
      errors.push('INTRA_IMPORT_CONFLICT');
      rowStatus = 'BLOCKED';
    } else {
      errors.push('INTRA_IMPORT_DUPLICATE');
      if (rowStatus !== 'BLOCKED') {
        rowStatus = 'WARNING';
      }
      proposedAction = 'SKIP';
    }
  } else {
    seen.set(identityKey, { resultCode });
  }

  const student = looksLikeRegistrationNumber(registrationNumber)
    ? await findStudentByRegistrationNumber(registrationNumber)
    : null;
  if (!student) {
    if (!errors.includes('MALFORMED_REGISTRATION_NUMBER')) {
      errors.push('STUDENT_NOT_FOUND');
    }
    rowStatus = 'BLOCKED';
  } else if (String(student.departmentId) !== String(importDoc.departmentId)) {
    errors.push('STUDENT_OUTSIDE_DEPARTMENT');
    rowStatus = 'BLOCKED';
  } else {
    matchStatus = 'MATCHED';
    matchedStudentUserId = student.userId;
  }

  if (subjectCode) {
    const subject = await Subject.findOne({
      departmentId: importDoc.departmentId,
      code: subjectCode,
    });
    if (!subject) {
      errors.push('SUBJECT_NOT_FOUND');
      rowStatus = 'BLOCKED';
    } else {
      subjectId = subject._id;
      if (student) {
        const offering = await SubjectOffering.findOne({
          departmentId: importDoc.departmentId,
          subjectId: subject._id,
          batchId: student.batchId,
          academicYearId: student.currentAcademicYearId,
          semesterId: student.currentSemesterId,
        });
        subjectOfferingId = offering?._id || null;
      }
    }
  }

  if (rowStatus !== 'BLOCKED' && matchedStudentUserId && subjectId && proposedAction !== 'SKIP') {
    const existing = await AcademicResult.findOne({ registrationNumber, subjectCode });
    proposedAction = actionForExistingResult(existing?.resultCode, resultCode);
  }

  if (rowStatus === 'BLOCKED') {
    proposedAction = 'SKIP';
    if (matchStatus !== 'MATCHED') {
      matchStatus = 'UNMATCHED';
    }
  }

  return {
    importId: importDoc._id,
    registrationNumber: registrationNumber || 'UNKNOWN',
    subjectCode: subjectCode || 'UNKNOWN',
    resultCode: resultCode || 'UNKNOWN',
    sourceRegistrationNumber,
    sourceSubjectCode,
    sourceResultCode,
    displayName: parsed.displayName || '',
    sourceLocation: parsed.sourceLocation || '',
    matchedStudentUserId,
    subjectId,
    subjectOfferingId,
    matchStatus,
    rowStatus,
    validationErrors: errors,
    proposedAction,
    isEca,
  };
}

export async function processResultParse({ importId, infrastructure }) {
  const importDoc = await ResultImport.findById(importId);
  if (!importDoc) {
    return null;
  }
  if (['COMMITTED', 'COMMITTING', 'REJECTED_FILE', 'CANCELLED'].includes(importDoc.processingStatus)) {
    return importDoc;
  }

  const file = await StoredFile.findById(importDoc.fileId);
  if (!file) {
    importDoc.processingStatus = 'PARSE_FAILED';
    importDoc.failureCode = 'FILE_MISSING';
    importDoc.failedAt = new Date();
    await importDoc.save();
    return importDoc;
  }
  if (file.scanStatus === 'UNSAFE' || file.scanStatus === 'REJECTED') {
    importDoc.processingStatus = 'REJECTED_FILE';
    importDoc.failureCode = 'UNSAFE_FILE';
    importDoc.failedAt = new Date();
    await importDoc.save();
    return importDoc;
  }
  if (file.scanStatus !== 'SAFE') {
    importDoc.processingStatus = 'PROCESSING';
    await importDoc.save();
    return importDoc;
  }

  importDoc.processingStatus = 'PROCESSING';
  importDoc.parserVersion = RESULT_PARSER_VERSION;
  importDoc.parseStartedAt = new Date();
  await importDoc.save();

  let parsed;
  try {
    const object = await infrastructure.storage.getObject(file.storageKey);
    parsed =
      importDoc.sourceType === 'PDF' ? await parsePdfResults(object.body) : await parseXlsxResults(object.body);
  } catch (error) {
    importDoc.processingStatus = 'PARSE_FAILED';
    importDoc.failureCode = 'PARSE_EXCEPTION';
    importDoc.failedAt = new Date();
    await importDoc.save();
    infrastructure.logger?.warn('Result parse failed', { importId: String(importId), message: error.message });
    return importDoc;
  }

  await ResultImportRow.deleteMany({ importId: importDoc._id });
  const seen = new Map();
  const classified = [];
  for (const row of parsed.rows) {
    classified.push(await classifyRow({ importDoc, parsed: row, seen }));
  }
  const finalized = blockConflictingIdentities(classified);
  if (finalized.length) {
    await ResultImportRow.insertMany(finalized);
  }

  importDoc.summary = summarize(finalized);
  if (!finalized.length) {
    importDoc.processingStatus = 'PARSE_FAILED';
    importDoc.failureCode = 'NO_ROWS';
    importDoc.failedAt = new Date();
  } else if (finalized.some((row) => row.proposedAction === 'NEW' || row.proposedAction === 'UPDATE')) {
    importDoc.processingStatus = 'READY_FOR_REVIEW';
    importDoc.failureCode = undefined;
    importDoc.failedAt = undefined;
  } else {
    importDoc.processingStatus = 'VALIDATION_ISSUES';
  }
  importDoc.parseFinishedAt = new Date();
  await importDoc.save();
  return importDoc;
}

export async function createResultImport(principal, file, body, { config, infrastructure }) {
  assertAdmin(principal);
  if (!file?.buffer?.length) {
    throw new ValidationError('File is required');
  }
  const maxBytes = config.files?.maxBytes || 20 * 1024 * 1024;
  if (file.buffer.length > maxBytes) {
    throw new PayloadTooLargeError('File exceeds the result import size limit');
  }
  const displayFilename = sanitizeDisplayFilename(file.originalname);
  const detectedType = detectResultImportContentType(file.buffer, file.mimetype);
  assertAllowedResultImportType(detectedType);
  const sourceType = detectedType === 'application/pdf' ? 'PDF' : 'XLSX';
  const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');

  const existingOpen = await ResultImport.findOne({
    departmentId: principal.departmentId,
    checksumSha256,
    processingStatus: { $nin: ['FAILED', 'REJECTED_FILE', 'PARSE_FAILED', 'COMMITTED'] },
  });
  if (existingOpen) {
    return mapImport(existingOpen);
  }

  const committedDuplicate = await ResultImport.findOne({
    departmentId: principal.departmentId,
    checksumSha256,
    processingStatus: 'COMMITTED',
  });

  if (!infrastructure.storage?.putObject || !infrastructure.storage?.getObject) {
    throw new ValidationError('File storage is not configured');
  }

  const importId = new mongoose.Types.ObjectId();
  const storageKey = `result-imports/${principal.departmentId}/${importId}/${randomUUID()}`;
  await infrastructure.storage.putObject({ key: storageKey, body: file.buffer, contentType: detectedType });
  const stored = await StoredFile.create({
    storageKey,
    originalFilename: displayFilename,
    displayFilename,
    mimeType: detectedType,
    sizeBytes: file.buffer.length,
    uploadedByUserId: principal.userId,
    owningDomain: 'RESULT_IMPORT',
    owningContextId: importId,
    scanStatus: 'SCANNING',
    reviewStatus: 'NOT_REQUIRED',
    availability: 'UNAVAILABLE',
    checksumSha256,
  });

  const importDoc = await ResultImport.create({
    _id: importId,
    departmentId: principal.departmentId,
    fileId: stored._id,
    uploadedByUserId: principal.userId,
    sourceType,
    checksumSha256,
    sourceBatchId: body?.batchId || undefined,
    sourceAcademicYearId: body?.academicYearId || undefined,
    sourceSemesterId: body?.semesterId || undefined,
    processingStatus: 'UPLOADED',
    duplicateOfImportId: committedDuplicate?._id,
    originalFilename: displayFilename,
    sizeBytes: file.buffer.length,
    parserVersion: RESULT_PARSER_VERSION,
    processingAttempt: 1,
  });

  await enqueueMalwareScan({ queue: infrastructure.queue, fileId: stored._id });
  if (infrastructure.malwareScanner) {
    await processMalwareScan({
      fileId: stored._id,
      scanner: infrastructure.malwareScanner,
      logger: infrastructure.logger,
    });
  }

  if (infrastructure.queue?.enqueue) {
    await infrastructure.queue.enqueue({
      name: JOB_NAMES.RESULT_PARSE,
      payload: { importId: String(importDoc._id) },
      jobId: `results.parse:${importDoc._id}`,
    });
  }
  await processResultParse({ importId: importDoc._id, infrastructure });

  await recordAudit({
    actorUserId: principal.userId,
    action: 'results.import.create',
    entityId: importDoc._id,
    departmentId: importDoc.departmentId,
    metadata: { sourceType, checksumSha256 },
  });

  return mapImport(await ResultImport.findById(importDoc._id));
}

export async function listResultImports(principal, query = {}) {
  assertAdmin(principal);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { departmentId: principal.departmentId };
  if (query.status) {
    filter.processingStatus = String(query.status);
  }
  const [items, total] = await Promise.all([
    ResultImport.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ResultImport.countDocuments(filter),
  ]);
  return { items: items.map(mapImport), total, page, pageSize };
}

export async function getResultImport(principal, importId) {
  const doc = await loadDepartmentImport(principal, importId);
  return mapImport(doc);
}

export async function getResultImportPreview(principal, importId, query = {}) {
  const doc = await loadDepartmentImport(principal, importId);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { importId: doc._id };
  if (query.rowStatus) {
    filter.rowStatus = String(query.rowStatus);
  }
  const [items, total] = await Promise.all([
    ResultImportRow.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit),
    ResultImportRow.countDocuments(filter),
  ]);
  return {
    import: mapImport(doc),
    items: items.map(mapImportRow),
    total,
    page,
    pageSize,
  };
}

const COMMITTABLE_STATUSES = ['READY_FOR_REVIEW', 'VALIDATION_ISSUES', 'CONFIRMED', 'COMMIT_FAILED'];

export async function commitResultImport(principal, importId, { infrastructure }) {
  const importDoc = await loadDepartmentImport(principal, importId);
  if (importDoc.processingStatus === 'COMMITTED') {
    return mapImport(importDoc);
  }
  if (!COMMITTABLE_STATUSES.includes(importDoc.processingStatus)) {
    throw new ValidationError('Import is not ready to commit');
  }

  const locked = await ResultImport.findOneAndUpdate(
    {
      _id: importDoc._id,
      departmentId: principal.departmentId,
      processingStatus: { $in: COMMITTABLE_STATUSES },
    },
    { $set: { processingStatus: 'COMMITTING', confirmedAt: importDoc.confirmedAt || new Date() } },
    { new: true },
  );
  if (!locked) {
    const current = await ResultImport.findById(importDoc._id);
    if (current?.processingStatus === 'COMMITTED') {
      return mapImport(current);
    }
    throw new ConflictError('Import is already being committed');
  }

  const rows = await ResultImportRow.find({
    importId: locked._id,
    proposedAction: { $in: ['NEW', 'UPDATE'] },
    rowStatus: 'VALID',
    committedAt: { $exists: false },
  });
  if (!rows.length) {
    locked.processingStatus = 'VALIDATION_ISSUES';
    locked.failureCode = 'NO_COMMITTABLE_ROWS';
    await locked.save();
    throw new ValidationError('No new or updated rows are available to commit');
  }

  const affectedStudents = new Set();
  let writtenRows = 0;
  try {
  for (const row of rows) {
    const student = await findStudentByRegistrationNumber(row.registrationNumber);
    const subject = await Subject.findById(row.subjectId);
    if (!student || !subject || String(student.departmentId) !== String(locked.departmentId)) {
      throw new ConflictError('Import rows changed since preview; re-parse required');
    }

    let official = await AcademicResult.findOne({
      registrationNumber: row.registrationNumber,
      subjectCode: row.subjectCode,
    });
    const previousResultCode = official?.resultCode || '';
    if (official && official.resultCode === row.resultCode && Boolean(official.isEca) === Boolean(row.isEca)) {
      row.proposedAction = 'UNCHANGED';
      row.committedAt = new Date();
      await row.save();
      continue;
    }
    if (!official) {
      official = await AcademicResult.create({
        departmentId: importDoc.departmentId,
        studentUserId: student.userId,
        registrationNumber: row.registrationNumber,
        subjectId: subject._id,
        subjectCode: row.subjectCode,
        subjectOfferingId: row.subjectOfferingId,
        studentAcademicYearId: student.currentAcademicYearId,
        studentSemesterId: student.currentSemesterId,
        sourceImportId: locked._id,
        sourceBatchId: student.batchId,
        resultCode: row.resultCode,
        previousResultCode: '',
        version: 1,
        isEca: row.isEca,
        committedByUserId: principal.userId,
      });
    } else {
      if (String(official.studentUserId) !== String(student.userId)) {
        throw new ConflictError('Registration number is bound to a different student');
      }
      official.previousResultCode = official.resultCode;
      official.resultCode = row.resultCode;
      official.isEca = row.isEca;
      official.sourceImportId = locked._id;
      official.committedByUserId = principal.userId;
      official.version += 1;
      await official.save();
    }

    await ResultRevision.create({
      academicResultId: official._id,
      importId: locked._id,
      actorUserId: principal.userId,
      registrationNumber: row.registrationNumber,
      subjectCode: row.subjectCode,
      previousResultCode,
      newResultCode: row.resultCode,
    });
    await persistAudit({
      actorUserId: principal.userId,
      action: 'results.commit.row',
      entityType: 'AcademicResult',
      entityId: official._id,
      departmentId: locked.departmentId,
      metadata: {
        subjectCode: row.subjectCode,
        previousResultCode,
        newResultCode: row.resultCode,
        importId: String(locked._id),
      },
    });
    await syncIncompleteCaFromResult(official);
    row.committedAt = new Date();
    await row.save();
    writtenRows += 1;
    affectedStudents.add(String(student.userId));
  }
  } catch (error) {
    locked.processingStatus = 'COMMIT_FAILED';
    locked.failureCode = 'COMMIT_EXCEPTION';
    locked.failedAt = new Date();
    await locked.save();
    throw error;
  }

  locked.processingStatus = 'COMMITTED';
  locked.committedAt = new Date();
  locked.committedByUserId = principal.userId;
  locked.failureCode = undefined;
  locked.failedAt = undefined;
  await locked.save();

  const downstreamFailures = [];
  for (const studentUserId of affectedStudents) {
    try {
      await fanoutNotification({
        recipientUserId: studentUserId,
        type: 'RESULTS_UPDATED',
        sourceModule: 'results',
        sourceId: String(locked._id),
        actionPath: '/results/me',
        departmentId: locked.departmentId,
        infrastructure,
      });
    } catch (error) {
      if (error?.code !== 11000) {
        downstreamFailures.push({ studentUserId, stage: 'notification' });
        infrastructure.logger?.warn('Result notification failed after commit', {
          importId: String(locked._id),
          message: error.message,
        });
      }
    }
    try {
      if (infrastructure.queue?.enqueue) {
        await infrastructure.queue.enqueue({
          name: JOB_NAMES.GPA_RECALCULATE,
          payload: { studentUserId },
          jobId: `gpa.recalculate:${studentUserId}:${locked._id}`,
        });
        await infrastructure.queue.enqueue({
          name: JOB_NAMES.ECA_DETECT,
          payload: { studentUserId, importId: String(locked._id) },
          jobId: `results.eca:${studentUserId}:${locked._id}`,
        });
      }
      await recalculateStudentGpa(studentUserId);
    } catch (error) {
      downstreamFailures.push({ studentUserId, stage: 'gpa' });
      infrastructure.logger?.warn('GPA recalculation failed after result commit', {
        importId: String(locked._id),
        message: error.message,
      });
    }
  }

  await recordAudit({
    actorUserId: principal.userId,
    action: 'results.import.commit',
    entityId: locked._id,
    departmentId: locked.departmentId,
    metadata: {
      committedRows: writtenRows,
      students: affectedStudents.size,
      downstreamFailures: downstreamFailures.length,
    },
  });

  return mapImport(locked);
}

export async function rejectResultImport(principal, importId) {
  const importDoc = await loadDepartmentImport(principal, importId);
  if (importDoc.processingStatus === 'COMMITTED') {
    throw new ConflictError('A committed import cannot be rejected');
  }
  if (importDoc.processingStatus === 'COMMITTING') {
    throw new ConflictError('Import is being committed');
  }
  if (importDoc.processingStatus === 'CANCELLED') {
    return mapImport(importDoc);
  }
  importDoc.processingStatus = 'CANCELLED';
  await importDoc.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'results.import.reject',
    entityId: importDoc._id,
    departmentId: importDoc.departmentId,
    metadata: {},
  });
  return mapImport(importDoc);
}

export async function reprocessResultImport(principal, importId, { infrastructure }) {
  const importDoc = await loadDepartmentImport(principal, importId);
  if (['COMMITTED', 'COMMITTING'].includes(importDoc.processingStatus)) {
    throw new ConflictError('A committed import cannot be reprocessed');
  }
  importDoc.processingStatus = 'UPLOADED';
  importDoc.processingAttempt = (importDoc.processingAttempt || 1) + 1;
  importDoc.failureCode = undefined;
  importDoc.failedAt = undefined;
  await importDoc.save();
  await processResultParse({ importId: importDoc._id, infrastructure });
  await recordAudit({
    actorUserId: principal.userId,
    action: 'results.import.reprocess',
    entityId: importDoc._id,
    departmentId: importDoc.departmentId,
    metadata: { processingAttempt: importDoc.processingAttempt },
  });
  return mapImport(await ResultImport.findById(importDoc._id));
}
