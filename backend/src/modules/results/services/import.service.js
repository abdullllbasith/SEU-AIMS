import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { ResultImport } from '../models/result-import.model.js';
import { ResultImportRow } from '../models/result-import-row.model.js';
import { AcademicResult } from '../models/academic-result.model.js';
import { ResultRevision } from '../models/result-revision.model.js';
import { ECA_RESULT_CODE } from '../constants.js';
import { parseXlsxResults } from './xlsx-parser.js';
import { parsePdfResults } from './pdf-parser.js';
import { isKnownGrade, looksLikeRegistrationNumber, normalizeRegistrationNumber } from './normalize.js';
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
  };
}

async function classifyRow({ importDoc, parsed, seen }) {
  const errors = [];
  const registrationNumber = normalizeRegistrationNumber(parsed.registrationNumber);
  const subjectCode = String(parsed.subjectCode || '').trim().toUpperCase();
  const resultCode = String(parsed.resultCode || '').trim();
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
    if (rowStatus !== 'BLOCKED') {
      rowStatus = 'WARNING';
    }
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
    proposedAction = existing ? 'UPDATE' : 'NEW';
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
  if (['COMMITTED', 'PARSE_FAILED', 'REJECTED_FILE'].includes(importDoc.processingStatus)) {
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
  if (classified.length) {
    await ResultImportRow.insertMany(classified);
  }

  importDoc.summary = summarize(classified);
  if (!classified.length) {
    importDoc.processingStatus = 'PARSE_FAILED';
    importDoc.failureCode = 'NO_ROWS';
    importDoc.failedAt = new Date();
  } else if (classified.some((row) => row.proposedAction === 'NEW' || row.proposedAction === 'UPDATE')) {
    importDoc.processingStatus = 'READY_FOR_REVIEW';
  } else {
    importDoc.processingStatus = 'VALIDATION_ISSUES';
  }
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

export async function commitResultImport(principal, importId, { infrastructure }) {
  const importDoc = await loadDepartmentImport(principal, importId);
  if (importDoc.processingStatus === 'COMMITTED') {
    return mapImport(importDoc);
  }
  if (!['READY_FOR_REVIEW', 'VALIDATION_ISSUES', 'CONFIRMED'].includes(importDoc.processingStatus)) {
    throw new ValidationError('Import is not ready to commit');
  }

  const rows = await ResultImportRow.find({
    importId: importDoc._id,
    proposedAction: { $in: ['NEW', 'UPDATE'] },
    rowStatus: { $in: ['VALID', 'WARNING'] },
  });
  if (!rows.length) {
    throw new ValidationError('No valid rows are available to commit');
  }

  const affectedStudents = new Set();
  for (const row of rows) {
    const student = await findStudentByRegistrationNumber(row.registrationNumber);
    const subject = await Subject.findById(row.subjectId);
    if (!student || !subject || String(student.departmentId) !== String(importDoc.departmentId)) {
      throw new ConflictError('Import rows changed since preview; re-parse required');
    }

    let official = await AcademicResult.findOne({
      registrationNumber: row.registrationNumber,
      subjectCode: row.subjectCode,
    });
    const previousResultCode = official?.resultCode || '';
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
        sourceImportId: importDoc._id,
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
      official.sourceImportId = importDoc._id;
      official.committedByUserId = principal.userId;
      official.version += 1;
      await official.save();
    }

    await ResultRevision.create({
      academicResultId: official._id,
      importId: importDoc._id,
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
      departmentId: importDoc.departmentId,
      metadata: {
        subjectCode: row.subjectCode,
        previousResultCode,
        newResultCode: row.resultCode,
        importId: String(importDoc._id),
      },
    });
    await syncIncompleteCaFromResult(official);
    row.committedAt = new Date();
    await row.save();
    affectedStudents.add(String(student.userId));
  }

  importDoc.processingStatus = 'COMMITTED';
  importDoc.committedAt = new Date();
  importDoc.committedByUserId = principal.userId;
  importDoc.confirmedAt = importDoc.confirmedAt || new Date();
  await importDoc.save();

  for (const studentUserId of affectedStudents) {
    try {
      await fanoutNotification({
        recipientUserId: studentUserId,
        type: 'RESULTS_UPDATED',
        sourceModule: 'results',
        sourceId: String(importDoc._id),
        actionPath: '/results/me',
        departmentId: importDoc.departmentId,
        infrastructure,
      });
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
    if (infrastructure.queue?.enqueue) {
      await infrastructure.queue.enqueue({
        name: JOB_NAMES.GPA_RECALCULATE,
        payload: { studentUserId },
        jobId: `gpa.recalculate:${studentUserId}:${importDoc._id}`,
      });
      await infrastructure.queue.enqueue({
        name: JOB_NAMES.ECA_DETECT,
        payload: { studentUserId, importId: String(importDoc._id) },
        jobId: `results.eca:${studentUserId}:${importDoc._id}`,
      });
    }
    await recalculateStudentGpa(studentUserId);
  }

  await recordAudit({
    actorUserId: principal.userId,
    action: 'results.import.commit',
    entityId: importDoc._id,
    departmentId: importDoc.departmentId,
    metadata: { committedRows: rows.length, students: affectedStudents.size },
  });

  return mapImport(importDoc);
}
