import mongoose from 'mongoose';
import { AcademicResult } from '../models/academic-result.model.js';
import { ResultImport } from '../models/result-import.model.js';
import { ResultRevision } from '../models/result-revision.model.js';
import { IncompleteCa } from '../../ca-recovery/index.js';
import { ECA_RESULT_CODE } from '../constants.js';
import { normalizeRegistrationNumber, normalizeSubjectCode } from './normalize.js';
import { parsePagination, requireObjectId } from '../utils/http.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';

const OPEN_PROCESSING = ['UPLOADED', 'PROCESSING', 'COMMITTING'];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertAdmin(principal) {
  if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR || !principal.departmentId) {
    throw new ForbiddenError('Forbidden');
  }
}

export async function searchOfficialResults(principal, query = {}) {
  assertAdmin(principal);
  const registrationNumber = normalizeRegistrationNumber(query.registrationNumber);
  const subjectCode = normalizeSubjectCode(query.subjectCode);
  if (!registrationNumber && !subjectCode) {
    throw new ValidationError('Provide a registration number or a subject code');
  }
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { departmentId: principal.departmentId };
  if (registrationNumber) {
    filter.registrationNumber = new RegExp(`^${escapeRegex(registrationNumber)}`);
  }
  if (subjectCode) {
    filter.subjectCode = new RegExp(`^${escapeRegex(subjectCode)}`);
  }
  if (query.academicYearId) {
    requireObjectId(query.academicYearId, 'academic year');
    filter.studentAcademicYearId = query.academicYearId;
  }
  if (query.semesterId) {
    requireObjectId(query.semesterId, 'semester');
    filter.studentSemesterId = query.semesterId;
  }
  const [items, total] = await Promise.all([
    AcademicResult.find(filter)
      .sort({ subjectCode: 1, registrationNumber: 1 })
      .skip(skip)
      .limit(limit)
      .select('registrationNumber subjectCode resultCode isEca version sourceImportId updatedAt studentAcademicYearId studentSemesterId'),
    AcademicResult.countDocuments(filter),
  ]);
  return {
    items: items.map((doc) => ({
      id: String(doc._id),
      registrationNumber: doc.registrationNumber,
      subjectCode: doc.subjectCode,
      resultCode: doc.resultCode,
      isEca: Boolean(doc.isEca),
      version: doc.version,
      sourceImportId: doc.sourceImportId ? String(doc.sourceImportId) : null,
      academicYearId: String(doc.studentAcademicYearId),
      semesterId: String(doc.studentSemesterId),
      updatedAt: doc.updatedAt,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getResultVersions(principal, resultId) {
  assertAdmin(principal);
  requireObjectId(resultId, 'result');
  const official = await AcademicResult.findById(resultId).select(
    'departmentId registrationNumber subjectCode resultCode version sourceImportId',
  );
  if (!official || String(official.departmentId) !== String(principal.departmentId)) {
    throw new NotFoundError('Result not found');
  }
  const revisions = await ResultRevision.find({ academicResultId: official._id }).sort({ createdAt: 1 });
  return {
    current: {
      id: String(official._id),
      registrationNumber: official.registrationNumber,
      subjectCode: official.subjectCode,
      resultCode: official.resultCode,
      version: official.version,
      sourceImportId: official.sourceImportId ? String(official.sourceImportId) : null,
    },
    versions: revisions.map((revision) => ({
      id: String(revision._id),
      previousResultCode: revision.previousResultCode || '',
      newResultCode: revision.newResultCode,
      importId: String(revision.importId),
      createdAt: revision.createdAt,
    })),
  };
}

export async function getResultAnalytics(principal) {
  assertAdmin(principal);
  const departmentId = new mongoose.Types.ObjectId(String(principal.departmentId));
  const attentionCodes = ['E', ECA_RESULT_CODE, 'D'];
  const [importCounts, gradeRows, officialCount, ecaCount, revisionCount, subjectAttentionRows] =
    await Promise.all([
      ResultImport.aggregate([
        { $match: { departmentId } },
        { $group: { _id: '$processingStatus', count: { $sum: 1 } } },
      ]),
      AcademicResult.aggregate([
        { $match: { departmentId } },
        { $group: { _id: '$resultCode', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
      ]),
      AcademicResult.countDocuments({ departmentId }),
      AcademicResult.countDocuments({ departmentId, isEca: true }),
      ResultRevision.aggregate([
        {
          $lookup: {
            from: AcademicResult.collection.name,
            localField: 'academicResultId',
            foreignField: '_id',
            as: 'result',
          },
        },
        { $unwind: '$result' },
        { $match: { 'result.departmentId': departmentId } },
        { $count: 'count' },
      ]),
      AcademicResult.aggregate([
        { $match: { departmentId, resultCode: { $in: attentionCodes } } },
        {
          $group: {
            _id: { subjectCode: '$subjectCode', resultCode: '$resultCode' },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1, '_id.subjectCode': 1, '_id.resultCode': 1 } },
        { $limit: 8 },
      ]),
    ]);
  return {
    officialResultCount: officialCount,
    ecaCount,
    revisionCount: revisionCount[0]?.count || 0,
    importsByStatus: importCounts.map((row) => ({ status: row._id, count: row.count })),
    gradeDistribution: gradeRows.map((row) => ({ resultCode: row._id, count: row.count })),
    subjectAttention: subjectAttentionRows.map((row) => ({
      subjectCode: row._id.subjectCode,
      resultCode: row._id.resultCode,
      count: row.count,
    })),
    definitions: {
      officialResultCount: 'Current official result rows in this department. One row per registration number and subject code.',
      ecaCount: 'Official rows whose current result code is E(CA).',
      revisionCount: 'Stored result revisions for this department, including the first commit of a row.',
      gradeDistribution: 'Count of current official result codes. Codes are not regrouped.',
      subjectAttention:
        'Subject codes with the highest counts of D, E, or E(CA) official results. Aggregated only; no student identifiers.',
    },
  };
}

export async function reconcileResults(principal) {
  assertAdmin(principal);
  const departmentId = principal.departmentId;
  const issues = [];
  const ecaResults = await AcademicResult.find({ departmentId, isEca: true }).select('_id registrationNumber subjectCode').lean();
  const ecaIds = ecaResults.map((row) => row._id);
  const openConditions = await IncompleteCa.find({ academicResultId: { $in: ecaIds }, status: 'OPEN' })
    .select('academicResultId')
    .lean();
  const openIds = new Set(openConditions.map((row) => String(row.academicResultId)));
  for (const result of ecaResults) {
    if (!openIds.has(String(result._id))) {
      issues.push({
        issue: 'ECA_WITHOUT_OPEN_CONDITION',
        entity: 'AcademicResult',
        entityId: String(result._id),
        registrationNumber: result.registrationNumber,
        subjectCode: result.subjectCode,
        severity: 'warning',
        recommendedAction: 'Review the official E(CA) row and the linked incomplete-CA record. Do not edit the grade from this report.',
      });
    }
  }

  const openAll = await IncompleteCa.find({ departmentId, status: 'OPEN' })
    .select('academicResultId registrationNumber subjectCode')
    .lean();
  const linked = await AcademicResult.find({ _id: { $in: openAll.map((row) => row.academicResultId) } })
    .select('isEca resultCode')
    .lean();
  const byResult = new Map(linked.map((row) => [String(row._id), row]));
  for (const condition of openAll) {
    const result = byResult.get(String(condition.academicResultId));
    if (!result || !result.isEca) {
      issues.push({
        issue: 'OPEN_CONDITION_WITHOUT_ECA',
        entity: 'IncompleteCa',
        entityId: String(condition._id),
        registrationNumber: condition.registrationNumber,
        subjectCode: condition.subjectCode,
        severity: 'warning',
        recommendedAction: 'The open incomplete-CA record does not match a current E(CA) result. Confirm before changing either record.',
      });
    }
  }

  const stuck = await ResultImport.find({
    departmentId,
    processingStatus: { $in: OPEN_PROCESSING },
  })
    .select('processingStatus createdAt')
    .lean();
  for (const item of stuck) {
    issues.push({
      issue: 'IMPORT_NOT_TERMINAL',
      entity: 'ResultImport',
      entityId: String(item._id),
      severity: 'info',
      recommendedAction: `Import is ${item.processingStatus}. This report does not fail it automatically.`,
    });
  }

  return { issues, issueCount: issues.length };
}
