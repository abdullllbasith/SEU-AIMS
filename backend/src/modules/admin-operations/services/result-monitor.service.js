import { ResultImport, ResultImportRow } from '../../results/index.js';
import { User } from '../../authentication/index.js';
import { AuditEvent } from '../../audit-security/index.js';
import { NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { departmentObjectId, parseObjectId, parsePage } from './scope.js';

export async function listResultImports(principal, query = {}) {
  const departmentId = departmentObjectId(principal);
  const { page, pageSize } = parsePage(query);
  const filter = { departmentId };
  if (query.processingStatus) {
    filter.processingStatus = String(query.processingStatus);
  }
  const [items, total] = await Promise.all([
    ResultImport.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select(
        'processingStatus sourceType summary uploadedByUserId createdAt committedAt failedAt failureCode duplicateOfImportId sourceBatchId sourceAcademicYearId sourceSemesterId fileId',
      )
      .lean(),
    ResultImport.countDocuments(filter),
  ]);
  const uploaders = await User.find({
    _id: { $in: items.map((row) => row.uploadedByUserId) },
  })
    .select('displayName email')
    .lean();
  const byId = new Map(uploaders.map((user) => [String(user._id), user]));

  return {
    page,
    pageSize,
    total,
    items: items.map((row) => ({
      importId: String(row._id),
      processingStatus: row.processingStatus,
      sourceType: row.sourceType,
      uploadedAt: row.createdAt,
      uploadedBy: byId.get(String(row.uploadedByUserId))
        ? {
            displayName: byId.get(String(row.uploadedByUserId)).displayName,
            email: byId.get(String(row.uploadedByUserId)).email,
          }
        : null,
      summary: row.summary,
      duplicateOfImportId: row.duplicateOfImportId ? String(row.duplicateOfImportId) : null,
      failedAt: row.failedAt || null,
      failureCode: row.failureCode || null,
      committedAt: row.committedAt || null,
    })),
    notes: ['Row-level grades are not listed in this operational summary. Review/commit remains on /api/results.'],
  };
}

export async function getResultImportMonitor(principal, importIdParam) {
  const departmentId = departmentObjectId(principal);
  const importId = parseObjectId(importIdParam, 'importId');
  if (!importId) {
    throw new ValidationError('Invalid importId');
  }
  const doc = await ResultImport.findOne({ _id: importId, departmentId }).lean();
  if (!doc) {
    throw new NotFoundError('Import not found');
  }
  const [rowGroups, audit] = await Promise.all([
    ResultImportRow.aggregate([
      { $match: { importId } },
      {
        $group: {
          _id: { proposedAction: '$proposedAction', rowStatus: '$rowStatus' },
          count: { $sum: 1 },
        },
      },
    ]),
    AuditEvent.find({
      departmentId,
      entityType: { $in: ['ResultImport', 'result-import'] },
      entityId: String(importId),
    })
      .sort({ occurredAt: -1 })
      .limit(50)
      .select('action result occurredAt actorRole reason')
      .lean(),
  ]);

  return {
    importId: String(doc._id),
    processingStatus: doc.processingStatus,
    sourceType: doc.sourceType,
    fileId: String(doc.fileId),
    uploadedByUserId: String(doc.uploadedByUserId),
    uploadedAt: doc.createdAt,
    summary: doc.summary,
    duplicateOfImportId: doc.duplicateOfImportId ? String(doc.duplicateOfImportId) : null,
    confirmedAt: doc.confirmedAt || null,
    committedAt: doc.committedAt || null,
    failedAt: doc.failedAt || null,
    failureCode: doc.failureCode || null,
    rowGroups: rowGroups.map((row) => ({
      proposedAction: row._id.proposedAction,
      rowStatus: row._id.rowStatus,
      count: row.count,
    })),
    audit: audit.map((row) => ({
      action: row.action,
      result: row.result,
      occurredAt: row.occurredAt,
      actorRole: row.actorRole,
      reason: row.reason || null,
    })),
    notes: [
      'proposedAction UPDATE is the operational view of historical/repeat-student updates already stored on the import.',
      'This endpoint does not mutate AcademicResult.',
    ],
  };
}
