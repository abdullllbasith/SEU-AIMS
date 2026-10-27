import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { ResultImport } from '../models/result-import.model.js';
import { ResultImportRow } from '../models/result-import-row.model.js';
import { AcademicResult } from '../models/academic-result.model.js';
import { ResultRevision } from '../models/result-revision.model.js';
import { RESULT_COMMIT_LOCK_MS, RESULT_PARSER_VERSION } from '../constants.js';
import { RESULT_PERIOD_VERSION, chooseSubjectPeriod, deriveResultPeriods } from './result-period.js';
import { parseXlsxResults } from './xlsx-parser.js';
import { parsePdfResults } from './pdf-parser.js';
import {
  countsAsIncompleteCa,
  isKnownGrade,
  isRecognizedNonGrade,
  looksLikeRegistrationNumber,
  normalizeRegistrationNumber,
  normalizeResultCode,
  normalizeSubjectCode,
} from './normalize.js';
import { actionForExistingResult, blockConflictingIdentities } from './classification.js';
import { resolveRepeatOfficialGrade } from './repeat-grade.js';
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
  AcademicYear,
  CurriculumMapping,
  Semester,
  Subject,
  SubjectOffering,
  StudentAcademicContext,
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
import {
  findPendingRecoveryReview,
  submitPendingCaRecovery,
  syncIncompleteCaFromResult,
} from '../../ca-recovery/index.js';
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
    reviewRows: rows.filter((row) => row.proposedAction === 'REVIEW').length,
    conflictRows: rows.filter((row) => (row.validationErrors || []).includes('INTRA_IMPORT_CONFLICT')).length,
    duplicateRows: rows.filter((row) => (row.validationErrors || []).includes('INTRA_IMPORT_DUPLICATE')).length,
  };
}

async function periodForSubject(departmentId, subject, student) {
  const [mappings, offerings, years, semesters] = await Promise.all([
    CurriculumMapping.find({
      departmentId,
      subjectId: subject._id,
      status: 'ACTIVE',
    })
      .select('subjectId academicYearId semesterId')
      .lean(),
    SubjectOffering.find({
      departmentId,
      subjectId: subject._id,
      batchId: student.batchId,
    })
      .select('subjectId batchId academicYearId semesterId')
      .lean(),
    AcademicYear.find({ departmentId }).select('name sequence').lean(),
    Semester.find({ departmentId }).select('name sequence academicYearId').lean(),
  ]);
  return (
    chooseSubjectPeriod({
      subjectId: subject._id,
      batchId: student.batchId,
      mappings,
      offerings,
      years,
      semesters,
    }) || {
      academicYearId: student.currentAcademicYearId || null,
      semesterId: student.currentSemesterId || null,
      subjectOfferingId: null,
    }
  );
}

async function buildImportLookup(importDoc, parsedRows) {
  const registrations = [
    ...new Set(
      parsedRows
        .map((row) => normalizeRegistrationNumber(row.registrationNumber))
        .filter((value) => looksLikeRegistrationNumber(value)),
    ),
  ];
  const subjectCodes = [
    ...new Set(parsedRows.map((row) => normalizeSubjectCode(row.subjectCode)).filter(Boolean)),
  ];
  const [students, subjects, existingResults] = await Promise.all([
    registrations.length
      ? StudentAcademicContext.find({ registrationNumber: { $in: registrations } }).lean()
      : [],
    subjectCodes.length
      ? Subject.find({ departmentId: importDoc.departmentId, code: { $in: subjectCodes } }).lean()
      : [],
    registrations.length && subjectCodes.length
      ? AcademicResult.find({
          registrationNumber: { $in: registrations },
          subjectCode: { $in: subjectCodes },
        })
          .select('registrationNumber subjectCode resultCode')
          .lean()
      : [],
  ]);
  const studentByRegistration = new Map(students.map((student) => [student.registrationNumber, student]));
  const subjectByCode = new Map(subjects.map((subject) => [subject.code, subject]));
  const subjectIds = subjects.map((subject) => subject._id);
  const [offerings, mappings, years, semesters] = await Promise.all([
    subjectIds.length
      ? SubjectOffering.find({
          departmentId: importDoc.departmentId,
          subjectId: { $in: subjectIds },
        })
          .select('subjectId batchId academicYearId semesterId')
          .lean()
      : [],
    subjectIds.length
      ? CurriculumMapping.find({
          departmentId: importDoc.departmentId,
          subjectId: { $in: subjectIds },
          status: 'ACTIVE',
        })
          .select('subjectId academicYearId semesterId')
          .lean()
      : [],
    AcademicYear.find({ departmentId: importDoc.departmentId }).select('name sequence').lean(),
    Semester.find({ departmentId: importDoc.departmentId }).select('name sequence academicYearId').lean(),
  ]);
  const resultByIdentity = new Map(
    existingResults.map((result) => [`${result.registrationNumber}|${result.subjectCode}`, result]),
  );
  return {
    student(registrationNumber) {
      return studentByRegistration.get(registrationNumber) || null;
    },
    subject(subjectCode) {
      return subjectByCode.get(subjectCode) || null;
    },
    period(subject, student) {
      if (!subject || !student) {
        return null;
      }
      return (
        chooseSubjectPeriod({
          subjectId: subject._id,
          batchId: student.batchId,
          mappings,
          offerings,
          years,
          semesters,
        }) || {
          academicYearId: student.currentAcademicYearId || null,
          semesterId: student.currentSemesterId || null,
          subjectOfferingId: null,
        }
      );
    },
    existing(registrationNumber, subjectCode) {
      return resultByIdentity.get(`${registrationNumber}|${subjectCode}`) || null;
    },
  };
}

async function classifyRow({ importDoc, parsed, seen, lookup }) {
  const errors = [];
  const sourceRegistrationNumber = String(parsed.registrationNumber || '').trim();
  const sourceSubjectCode = String(parsed.subjectCode || '').trim();
  const sourceResultCode = String(parsed.resultCode || '').trim();
  const registrationNumber = normalizeRegistrationNumber(sourceRegistrationNumber);
  const subjectCode = normalizeSubjectCode(sourceSubjectCode);
  const resultCode = normalizeResultCode(sourceResultCode);
  let isEca = countsAsIncompleteCa(resultCode);
  let rowStatus = 'VALID';
  let matchStatus = 'UNMATCHED';
  let proposedAction = 'NEW';
  let matchedStudentUserId = null;
  let subjectId = null;
  let subjectOfferingId = null;
  let academicYearId = null;
  let semesterId = null;
  let officialResultCode = resultCode;
  let rawResultCode = resultCode;
  let gradeCapApplied = false;
  let gradeCapReason = '';
  let reviewRequired = false;
  let explanation = '';

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
  } else if (!isKnownGrade(resultCode) && !isRecognizedNonGrade(resultCode)) {
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
    ? lookup
      ? lookup.student(registrationNumber)
      : await findStudentByRegistrationNumber(registrationNumber)
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
    const subject = lookup
      ? lookup.subject(subjectCode)
      : await Subject.findOne({
          departmentId: importDoc.departmentId,
          code: subjectCode,
        });
    if (!subject) {
      errors.push('SUBJECT_NOT_FOUND');
      rowStatus = 'BLOCKED';
    } else {
      subjectId = subject._id;
      if (student) {
        const period = lookup
          ? lookup.period(subject, student)
          : await periodForSubject(importDoc.departmentId, subject, student);
        subjectOfferingId = period?.subjectOfferingId || null;
        academicYearId = period?.academicYearId || student.currentAcademicYearId || null;
        semesterId = period?.semesterId || student.currentSemesterId || null;
      }
    }
  }

  if (rowStatus !== 'BLOCKED' && matchedStudentUserId && subjectId && proposedAction !== 'SKIP') {
    const existing = lookup
      ? lookup.existing(registrationNumber, subjectCode)
      : await AcademicResult.findOne({ registrationNumber, subjectCode });
    const decision = resolveRepeatOfficialGrade(existing?.resultCode, resultCode);
    officialResultCode = decision.officialResultCode;
    rawResultCode = decision.rawResultCode;
    gradeCapApplied = decision.gradeCapApplied;
    gradeCapReason = decision.gradeCapReason;
    reviewRequired = decision.reviewRequired;
    explanation = decision.explanation;
    isEca = countsAsIncompleteCa(officialResultCode);
    if (decision.blockedReason) {
      errors.push(decision.blockedReason);
      rowStatus = 'BLOCKED';
      proposedAction = 'SKIP';
    } else if (decision.reviewRequired) {
      const pending = existing ? await findPendingRecoveryReview(existing._id) : null;
      if (pending && pending.rawResultCode === resultCode) {
        proposedAction = 'UNCHANGED';
        explanation = `The same CA recovery grade ${resultCode} is already pending review. The official result remains E(CA).`;
      } else if (pending) {
        errors.push('DUPLICATE_CA_RECOVERY_PENDING');
        rowStatus = 'BLOCKED';
        proposedAction = 'SKIP';
      } else {
        proposedAction = 'REVIEW';
      }
    } else {
      proposedAction = actionForExistingResult(existing?.resultCode, officialResultCode);
      if (
        gradeCapApplied &&
        existing &&
        existing.resultCode === officialResultCode &&
        existing.rawResultCode !== rawResultCode
      ) {
        proposedAction = 'UPDATE';
      }
    }
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
    academicYearId,
    semesterId,
    matchStatus,
    rowStatus,
    validationErrors: errors,
    proposedAction,
    isEca,
    rawResultCode: rawResultCode || '',
    officialResultCode: officialResultCode || '',
    gradeCapApplied,
    gradeCapReason,
    reviewRequired,
    explanation,
  };
}

async function ensureResultPeriods(importDoc) {
  if (!importDoc || importDoc.resultPeriodsVersion === RESULT_PERIOD_VERSION) {
    return importDoc;
  }
  const rows = await ResultImportRow.find({ importId: importDoc._id }).select('subjectId matchedStudentUserId').lean();
  const resultPeriods = await deriveResultPeriods(importDoc.departmentId, rows);
  const updated = await ResultImport.findOneAndUpdate(
    { _id: importDoc._id, resultPeriodsVersion: { $ne: RESULT_PERIOD_VERSION } },
    { $set: { resultPeriods, resultPeriodsVersion: RESULT_PERIOD_VERSION } },
    { new: true },
  );
  return updated || (await ResultImport.findById(importDoc._id));
}

export async function processResultParse({ importId, infrastructure }) {
  const importDoc = await ResultImport.findById(importId);
  if (!importDoc) {
    return null;
  }
  if (['COMMITTED', 'COMMITTING', 'REJECTED_FILE', 'CANCELLED'].includes(importDoc.processingStatus)) {
    return importDoc;
  }
  if (parseIsFresh(importDoc)) {
    return importDoc;
  }

  const claimed = await ResultImport.findOneAndUpdate(
    {
      _id: importDoc._id,
      processingStatus: { $nin: ['COMMITTED', 'COMMITTING', 'REJECTED_FILE', 'CANCELLED'] },
      $or: [
        { processingStatus: { $ne: 'PROCESSING' } },
        { parseStartedAt: null },
        { parseStartedAt: { $lte: new Date(Date.now() - PARSE_LOCK_MS) } },
      ],
    },
    { $set: { processingStatus: 'PROCESSING', parserVersion: RESULT_PARSER_VERSION, parseStartedAt: new Date() } },
    { new: true },
  );
  if (!claimed) {
    return ResultImport.findById(importDoc._id);
  }

  let file = await StoredFile.findById(claimed.fileId);
  if (!file) {
    await ResultImport.updateOne(
      { _id: claimed._id, processingStatus: 'PROCESSING' },
      { $set: { processingStatus: 'PARSE_FAILED', failureCode: 'FILE_MISSING', failedAt: new Date() } },
    );
    return ResultImport.findById(claimed._id);
  }
  if (file.scanStatus === 'UNSAFE' || file.scanStatus === 'REJECTED') {
    await ResultImport.updateOne(
      { _id: claimed._id, processingStatus: 'PROCESSING' },
      { $set: { processingStatus: 'REJECTED_FILE', failureCode: 'UNSAFE_FILE', failedAt: new Date() } },
    );
    return ResultImport.findById(claimed._id);
  }
  if (file.scanStatus !== 'SAFE') {
    if (infrastructure?.malwareScanner && !['UNSAFE', 'REJECTED'].includes(file.scanStatus)) {
      await processMalwareScan({
        fileId: file._id,
        scanner: infrastructure.malwareScanner,
        logger: infrastructure.logger,
      });
      file = await StoredFile.findById(file._id);
    }
  }
  if (!file || file.scanStatus !== 'SAFE') {
    const waiting = file && ['UPLOADED', 'SCANNING'].includes(file.scanStatus);
    await ResultImport.updateOne(
      { _id: claimed._id, processingStatus: 'PROCESSING' },
      waiting
        ? { $set: { processingStatus: 'UPLOADED' }, $unset: { failureCode: 1, failedAt: 1 } }
        : {
            $set: {
              processingStatus: 'PARSE_FAILED',
              failureCode: 'SCAN_UNAVAILABLE',
              failedAt: new Date(),
            },
          },
    );
    return ResultImport.findById(claimed._id);
  }

  let parsed;
  try {
    const object = await infrastructure.storage.getObject(file.storageKey);
    parsed =
      claimed.sourceType === 'PDF' ? await parsePdfResults(object.body) : await parseXlsxResults(object.body);
  } catch (error) {
    await ResultImport.updateOne(
      { _id: claimed._id, processingStatus: 'PROCESSING' },
      { $set: { processingStatus: 'PARSE_FAILED', failureCode: 'PARSE_EXCEPTION', failedAt: new Date() } },
    );
    infrastructure.logger?.warn('Result parse failed', { importId: String(importId), message: error.message });
    return ResultImport.findById(claimed._id);
  }

  let finalized;
  try {
    await ResultImportRow.deleteMany({ importId: claimed._id });
    const seen = new Map();
    const lookup = await buildImportLookup(claimed, parsed.rows);
    const classified = [];
    for (let index = 0; index < parsed.rows.length; index += 1) {
      classified.push(await classifyRow({ importDoc: claimed, parsed: parsed.rows[index], seen, lookup }));
      if (index % 25 === 0 || index === parsed.rows.length - 1) {
        await ResultImport.updateOne(
          { _id: claimed._id, processingStatus: 'PROCESSING' },
          {
            $set: {
              parseStartedAt: new Date(),
              operationProgress: { completed: index + 1, total: parsed.rows.length },
            },
          },
        );
      }
    }
    finalized = blockConflictingIdentities(classified);
    if (finalized.length) {
      await ResultImportRow.insertMany(finalized);
    }
  } catch (error) {
    await ResultImport.updateOne(
      { _id: claimed._id, processingStatus: 'PROCESSING' },
      { $set: { processingStatus: 'PARSE_FAILED', failureCode: 'PARSE_EXCEPTION', failedAt: new Date() } },
    );
    infrastructure.logger?.warn('Result parse failed', { importId: String(importId), message: error.message });
    return ResultImport.findById(claimed._id);
  }

  let resultPeriods = [];
  try {
    resultPeriods = await deriveResultPeriods(claimed.departmentId, finalized);
  } catch (error) {
    await ResultImport.updateOne(
      { _id: claimed._id, processingStatus: 'PROCESSING' },
      { $set: { processingStatus: 'PARSE_FAILED', failureCode: 'PARSE_EXCEPTION', failedAt: new Date() } },
    );
    infrastructure.logger?.warn('Result parse failed', { importId: String(importId), message: error.message });
    return ResultImport.findById(claimed._id);
  }
  const summary = summarize(finalized);
  const update = {
    summary,
    resultPeriods,
    resultPeriodsVersion: RESULT_PERIOD_VERSION,
    parseFinishedAt: new Date(),
  };
  if (!finalized.length) {
    update.processingStatus = 'PARSE_FAILED';
    update.failureCode = parsed.textCharacters != null && parsed.textCharacters < 40 ? 'NO_TEXT' : 'NO_ROWS';
    update.failedAt = new Date();
  } else if (finalized.some((row) => row.proposedAction === 'NEW' || row.proposedAction === 'UPDATE')) {
    update.processingStatus = 'READY_FOR_REVIEW';
  } else {
    update.processingStatus = 'VALIDATION_ISSUES';
  }
  const parsedDoc = await ResultImport.findOneAndUpdate(
    { _id: claimed._id, processingStatus: 'PROCESSING' },
    {
      $set: update,
      ...(update.processingStatus === 'READY_FOR_REVIEW' || update.processingStatus === 'VALIDATION_ISSUES'
        ? { $unset: { failureCode: 1, failedAt: 1 } }
        : {}),
    },
    { new: true },
  );
  return parsedDoc || ResultImport.findById(claimed._id);
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
    processingStatus: { $nin: ['FAILED', 'REJECTED_FILE', 'PARSE_FAILED', 'COMMITTED', 'CANCELLED'] },
  });
  if (existingOpen && ['UPLOADED', 'PROCESSING'].includes(existingOpen.processingStatus) && !parseIsFresh(existingOpen)) {
    await runImportPipeline(existingOpen._id, infrastructure);
    return mapImport(await ensureResultPeriods(await ResultImport.findById(existingOpen._id)));
  }
  if (existingOpen) {
    return mapImport(await ensureResultPeriods(existingOpen));
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
  if (infrastructure.queue?.enqueue) {
    await infrastructure.queue.enqueue({
      name: JOB_NAMES.RESULT_PARSE,
      payload: { importId: String(importDoc._id) },
      jobId: `results.parse:${importDoc._id}`,
    });
  }
  await runImportPipeline(importDoc._id, infrastructure);

  await recordAudit({
    actorUserId: principal.userId,
    action: 'results.import.create',
    entityId: importDoc._id,
    departmentId: importDoc.departmentId,
    metadata: { sourceType, checksumSha256 },
  });

  return mapImport(await ResultImport.findById(importDoc._id));
}

export async function listResultImports(principal, query = {}, infrastructure) {
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
  const withPeriods = await Promise.all(items.map((item) => ensureResultPeriods(item)));
  for (const item of withPeriods) {
    if (!['UPLOADED', 'PROCESSING'].includes(item.processingStatus) || parseIsFresh(item)) {
      continue;
    }
    runImportPipeline(item._id, infrastructure).catch((error) => {
      infrastructure?.logger?.warn('Queued result parse failed', {
        importId: String(item._id),
        message: error.message,
      });
    });
  }
  return { items: withPeriods.map(mapImport), total, page, pageSize };
}

export async function getResultImport(principal, importId) {
  const doc = await ensureResultPeriods(await loadDepartmentImport(principal, importId));
  return mapImport(doc);
}

export async function getResultImportPreview(principal, importId, query = {}) {
  const doc = await ensureResultPeriods(await loadDepartmentImport(principal, importId));
  const { skip, limit, page, pageSize } = parsePagination(query, { maxPageSize: 2000 });
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
const PARSE_LOCK_MS = 3 * 60 * 1000;

function parseIsFresh(doc) {
  if (doc?.processingStatus !== 'PROCESSING' || !doc.parseStartedAt) {
    return false;
  }
  return Date.now() - new Date(doc.parseStartedAt).getTime() < PARSE_LOCK_MS;
}

async function runImportPipeline(importId, infrastructure) {
  const importDoc = await ResultImport.findById(importId);
  if (!importDoc) {
    return null;
  }
  const file = importDoc.fileId ? await StoredFile.findById(importDoc.fileId) : null;
  if (
    file &&
    infrastructure?.malwareScanner &&
    !['SAFE', 'UNSAFE', 'REJECTED'].includes(file.scanStatus)
  ) {
    await processMalwareScan({
      fileId: file._id,
      scanner: infrastructure.malwareScanner,
      logger: infrastructure.logger,
    });
  }
  return processResultParse({ importId, infrastructure });
}

function commitBlockMessage(doc) {
  if (doc?.failureCode === 'NO_TEXT') {
    return 'This PDF has no selectable result text. A scanned image cannot be committed. Upload a text PDF or an XLSX sheet.';
  }
  if (doc?.failureCode === 'NO_ROWS') {
    return 'No registration, subject, and result rows were found, so there is nothing to commit.';
  }
  if (doc?.failureCode === 'UNSAFE_FILE' || doc?.processingStatus === 'REJECTED_FILE') {
    return 'This file was rejected by the malware scan and cannot be committed.';
  }
  if (doc?.failureCode === 'FILE_MISSING') {
    return 'The uploaded file is missing, so this import cannot be committed.';
  }
  if (doc?.failureCode === 'PARSE_EXCEPTION') {
    return 'The file could not be parsed, so this import cannot be committed.';
  }
  if (doc?.processingStatus === 'PROCESSING' || doc?.processingStatus === 'UPLOADED') {
    return 'This file has not passed a malware scan, so it cannot be parsed or committed.';
  }
  return 'Import is not ready to commit';
}

async function finishResultImportProcessing(importDoc, infrastructure) {
  const file = importDoc.fileId ? await StoredFile.findById(importDoc.fileId) : null;
  if (
    file &&
    !['SAFE', 'UNSAFE', 'REJECTED'].includes(file.scanStatus) &&
    infrastructure?.malwareScanner
  ) {
    await processMalwareScan({
      fileId: file._id,
      scanner: infrastructure.malwareScanner,
      logger: infrastructure.logger,
    });
  }
  return processResultParse({ importId: importDoc._id, infrastructure });
}

function commitLockIsFresh(importDoc) {
  if (importDoc?.processingStatus !== 'COMMITTING') {
    return false;
  }
  if (!importDoc.committingStartedAt) {
    return false;
  }
  return Date.now() - new Date(importDoc.committingStartedAt).getTime() < RESULT_COMMIT_LOCK_MS;
}

async function markImportCommitted(locked, principal, commitToken) {
  const updated = await ResultImport.findOneAndUpdate(
    { _id: locked._id, processingStatus: 'COMMITTING', commitToken },
    {
      $set: {
        processingStatus: 'COMMITTED',
        committedAt: new Date(),
        committedByUserId: principal.userId,
      },
      $unset: { failureCode: 1, failedAt: 1, committingStartedAt: 1, commitToken: 1 },
    },
    { new: true },
  );
  return updated || ResultImport.findById(locked._id);
}

export async function commitResultImport(principal, importId, { infrastructure }) {
  let importDoc = await loadDepartmentImport(principal, importId);
  if (importDoc.processingStatus === 'COMMITTED') {
    return mapImport(importDoc);
  }
  const resumeStale = importDoc.processingStatus === 'COMMITTING' && !commitLockIsFresh(importDoc);
  if (importDoc.processingStatus === 'COMMITTING' && !resumeStale) {
    throw new ConflictError('This import is still committing. Wait a moment, then refresh.');
  }
  if (!resumeStale && !COMMITTABLE_STATUSES.includes(importDoc.processingStatus)) {
    if (['UPLOADED', 'PROCESSING', 'PARSE_FAILED'].includes(importDoc.processingStatus)) {
      const prepared = await finishResultImportProcessing(importDoc, infrastructure);
      if (prepared && COMMITTABLE_STATUSES.includes(prepared.processingStatus)) {
        importDoc = prepared;
      } else {
        throw new ValidationError(commitBlockMessage(prepared || importDoc));
      }
    } else {
      throw new ValidationError(commitBlockMessage(importDoc));
    }
  }

  const now = new Date();
  const commitToken = randomUUID();
  const lockFilter = resumeStale
    ? {
        _id: importDoc._id,
        departmentId: principal.departmentId,
        processingStatus: 'COMMITTING',
        $or: [
          { committingStartedAt: null },
          { committingStartedAt: { $lte: new Date(Date.now() - RESULT_COMMIT_LOCK_MS) } },
        ],
      }
    : {
        _id: importDoc._id,
        departmentId: principal.departmentId,
        processingStatus: { $in: COMMITTABLE_STATUSES },
      };
  const locked = await ResultImport.findOneAndUpdate(
    lockFilter,
    {
      $set: {
        processingStatus: 'COMMITTING',
        committingStartedAt: now,
        commitToken,
        confirmedAt: importDoc.confirmedAt || now,
      },
    },
    { new: true },
  );
  if (!locked) {
    const current = await ResultImport.findById(importDoc._id);
    if (current?.processingStatus === 'COMMITTED') {
      return mapImport(current);
    }
    throw new ConflictError('This import is still committing. Wait a moment, then refresh.');
  }

  const rows = await ResultImportRow.find({
    importId: locked._id,
    proposedAction: { $in: ['NEW', 'UPDATE', 'REVIEW'] },
    rowStatus: 'VALID',
    committedAt: { $exists: false },
  });
  const alreadyCommitted = await ResultImportRow.countDocuments({
    importId: locked._id,
    proposedAction: { $in: ['NEW', 'UPDATE', 'REVIEW', 'UNCHANGED'] },
    rowStatus: 'VALID',
    committedAt: { $exists: true },
  });
  const progressTotal = alreadyCommitted + rows.length;
  await ResultImport.updateOne(
    { _id: locked._id, processingStatus: 'COMMITTING', commitToken },
    { $set: { operationProgress: { completed: alreadyCommitted, total: progressTotal } } },
  );
  if (!rows.length) {
    const wroteRows = await ResultImportRow.exists({ importId: locked._id, committedAt: { $ne: null } });
    if (wroteRows) {
      const committed = await markImportCommitted(locked, principal, commitToken);
      if (committed?.processingStatus !== 'COMMITTED') {
        throw new ConflictError('Import commit was interrupted');
      }
      return mapImport(committed);
    }
    await ResultImport.updateOne(
      { _id: locked._id, processingStatus: 'COMMITTING', commitToken },
      {
        $set: { processingStatus: 'VALIDATION_ISSUES', failureCode: 'NO_COMMITTABLE_ROWS' },
        $unset: { committingStartedAt: 1, commitToken: 1 },
      },
    );
    throw new ValidationError('No new or updated rows are available to commit');
  }

  const affectedStudents = new Set();
  let writtenRows = 0;
  try {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (index % 5 === 0) {
      const heartbeat = await ResultImport.updateOne(
        { _id: locked._id, processingStatus: 'COMMITTING', commitToken },
        {
          $set: {
            committingStartedAt: new Date(),
            operationProgress: { completed: alreadyCommitted + writtenRows, total: progressTotal },
          },
        },
      );
      if (!heartbeat.matchedCount) {
        throw new ConflictError('Import commit was interrupted');
      }
    }
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
    const storedCode = row.officialResultCode || row.resultCode;
    const storedIsEca = countsAsIncompleteCa(storedCode);
    if (row.proposedAction === 'REVIEW') {
      if (!official) {
        throw new ConflictError('CA recovery review requires an existing E(CA) result');
      }
      await submitPendingCaRecovery({
        result: official,
        rawResultCode: row.rawResultCode || row.resultCode,
        importId: locked._id,
        importRowId: row._id,
        actorUserId: principal.userId,
      });
      row.committedAt = new Date();
      await row.save();
      writtenRows += 1;
      continue;
    }
    if (
      official &&
      official.resultCode === storedCode &&
      Boolean(official.isEca) === storedIsEca &&
      (!row.gradeCapApplied || official.rawResultCode === (row.rawResultCode || row.resultCode))
    ) {
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
        studentAcademicYearId: row.academicYearId || student.currentAcademicYearId,
        studentSemesterId: row.semesterId || student.currentSemesterId,
        sourceImportId: locked._id,
        sourceBatchId: student.batchId,
        resultCode: storedCode,
        previousResultCode: '',
        rawResultCode: row.rawResultCode || row.resultCode,
        gradeCapApplied: Boolean(row.gradeCapApplied),
        gradeCapReason: row.gradeCapReason || '',
        version: 1,
        isEca: storedIsEca,
        committedByUserId: principal.userId,
      });
    } else {
      if (String(official.studentUserId) !== String(student.userId)) {
        throw new ConflictError('Registration number is bound to a different student');
      }
      official.previousResultCode = official.resultCode;
      official.resultCode = storedCode;
      official.rawResultCode = row.rawResultCode || row.resultCode;
      official.gradeCapApplied = Boolean(row.gradeCapApplied);
      official.gradeCapReason = row.gradeCapReason || '';
      official.isEca = storedIsEca;
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
      newResultCode: storedCode,
      rawResultCode: row.rawResultCode || row.resultCode,
      gradeCapApplied: Boolean(row.gradeCapApplied),
      gradeCapReason: row.gradeCapReason || '',
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
        newResultCode: storedCode,
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
    if (error?.message !== 'Import commit was interrupted') {
      await ResultImport.updateOne(
        { _id: locked._id, processingStatus: 'COMMITTING', commitToken },
        {
          $set: { processingStatus: 'COMMIT_FAILED', failureCode: 'COMMIT_EXCEPTION', failedAt: new Date() },
          $unset: { committingStartedAt: 1, commitToken: 1 },
        },
      );
    }
    throw error;
  }

  const committed = await markImportCommitted(locked, principal, commitToken);
  if (committed?.processingStatus !== 'COMMITTED') {
    throw new ConflictError('Import commit was interrupted');
  }

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
  await finishResultImportProcessing(importDoc, infrastructure);
  await recordAudit({
    actorUserId: principal.userId,
    action: 'results.import.reprocess',
    entityId: importDoc._id,
    departmentId: importDoc.departmentId,
    metadata: { processingAttempt: importDoc.processingAttempt },
  });
  return mapImport(await ResultImport.findById(importDoc._id));
}
