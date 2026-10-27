import { SharedResource, ResourceReport } from '../models/index.js';
import { StoredFile } from '../../files/index.js';
import { recordAudit as persistAudit } from '../../audit-security/services/record-audit.service.js';
import { ValidationError, NotFoundError } from '../../../shared/errors/app-error.js';
import { requireModerator, getOrCreateSettings } from './access.service.js';
import { canTransitionResource } from '../policies/study-room.policies.js';
import { retryQuarantinedScans } from './resource.service.js';
import { mapResource } from '../mappers/study-room.mappers.js';
import { parsePagination, requireObjectId } from '../utils/http.js';
import { MODERATION_MODES, REPORT_STATUSES } from '../constants.js';

async function recordAudit({ actorUserId, action, entityId, entityType, metadata }) {
  await persistAudit({
    actorUserId,
    action,
    entityType,
    entityId,
    metadata,
  });
}

export async function getModerationSettings(principal) {
  const { settings } = await requireModerator(principal);
  return {
    departmentId: String(settings.departmentId),
    enabled: settings.enabled,
    moderationMode: settings.moderationMode,
  };
}

export async function updateModerationSettings(principal, body) {
  const { settings } = await requireModerator(principal);
  const previous = settings.moderationMode;
  if (body.moderationMode && !MODERATION_MODES.includes(body.moderationMode)) {
    throw new ValidationError('Invalid moderation mode');
  }
  if (typeof body.enabled === 'boolean') {
    settings.enabled = body.enabled;
  }
  if (body.moderationMode) {
    settings.moderationMode = body.moderationMode;
  }
  settings.updatedByUserId = principal.userId;
  await settings.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'study-room.settings.update',
    entityType: 'StudyRoomSettings',
    entityId: settings._id,
    metadata: { previousMode: previous, moderationMode: settings.moderationMode, enabled: settings.enabled },
  });
  return {
    departmentId: String(settings.departmentId),
    enabled: settings.enabled,
    moderationMode: settings.moderationMode,
  };
}

export async function listModerationQueue(principal, query, { infrastructure } = {}) {
  await requireModerator(principal);
  await retryQuarantinedScans({ departmentId: principal.departmentId, infrastructure });
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = {
    departmentId: principal.departmentId,
    deletedAt: { $exists: false },
  };
  if (query.state) {
    filter.moderationState = query.state;
  } else {
    filter.moderationState = { $in: ['PENDING_REVIEW', 'SCAN_FAILED', 'QUARANTINED'] };
  }
  const [items, total] = await Promise.all([
    SharedResource.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    SharedResource.countDocuments(filter),
  ]);
  const files = await StoredFile.find({ _id: { $in: items.map((item) => item.fileId) } });
  const fileById = new Map(files.map((file) => [String(file._id), file]));
  return {
    items: items.map((item) => mapResource(item, { file: fileById.get(String(item.fileId)), includeOperational: true })),
    total,
    page,
    pageSize,
  };
}

async function loadDepartmentResource(principal, resourceId) {
  requireObjectId(resourceId, 'resource');
  const resource = await SharedResource.findById(resourceId);
  if (!resource || String(resource.departmentId) !== String(principal.departmentId)) {
    throw new NotFoundError('Resource not found');
  }
  return resource;
}

export async function approveResource(principal, resourceId) {
  await requireModerator(principal);
  const resource = await loadDepartmentResource(principal, resourceId);
  const file = await StoredFile.findById(resource.fileId);
  if (!file || file.scanStatus !== 'SAFE') {
    throw new ValidationError('Resource cannot be approved until the scan is SAFE');
  }
  if (!canTransitionResource(resource.moderationState, 'AVAILABLE')) {
    throw new ValidationError('Invalid moderation transition');
  }
  const previous = resource.moderationState;
  resource.moderationState = 'AVAILABLE';
  resource.reviewStatus = 'APPROVED';
  file.availability = 'AVAILABLE';
  file.reviewStatus = 'APPROVED';
  await resource.save();
  await file.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'study-room.resource.approve',
    entityType: 'SharedResource',
    entityId: resource._id,
    metadata: { previous, next: 'AVAILABLE' },
  });
  return mapResource(resource, { file, includeOperational: true });
}

export async function rejectResource(principal, resourceId) {
  await requireModerator(principal);
  const resource = await loadDepartmentResource(principal, resourceId);
  const file = await StoredFile.findById(resource.fileId);
  if (!canTransitionResource(resource.moderationState, 'REJECTED')) {
    throw new ValidationError('Invalid moderation transition');
  }
  const previous = resource.moderationState;
  resource.moderationState = 'REJECTED';
  resource.reviewStatus = 'REJECTED';
  if (file) {
    file.availability = 'UNAVAILABLE';
    file.reviewStatus = 'REJECTED';
    await file.save();
  }
  await resource.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'study-room.resource.reject',
    entityType: 'SharedResource',
    entityId: resource._id,
    metadata: { previous, next: 'REJECTED' },
  });
  return mapResource(resource, { file, includeOperational: true });
}

export async function removeResource(principal, resourceId) {
  await requireModerator(principal);
  const resource = await loadDepartmentResource(principal, resourceId);
  const file = await StoredFile.findById(resource.fileId);
  if (!canTransitionResource(resource.moderationState, 'REMOVED') && resource.moderationState !== 'REMOVED') {
    throw new ValidationError('Invalid moderation transition');
  }
  const previous = resource.moderationState;
  resource.moderationState = 'REMOVED';
  resource.deletedAt = new Date();
  if (file) {
    file.availability = 'UNAVAILABLE';
    await file.save();
  }
  await resource.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'study-room.resource.remove',
    entityType: 'SharedResource',
    entityId: resource._id,
    metadata: { previous, next: 'REMOVED' },
  });
  return { removed: true };
}

export async function listReports(principal, query) {
  await requireModerator(principal);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { departmentId: principal.departmentId };
  if (query.status && REPORT_STATUSES.includes(query.status)) {
    filter.status = query.status;
  }
  const [items, total] = await Promise.all([
    ResourceReport.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ResourceReport.countDocuments(filter),
  ]);
  return {
    items: items.map((item) => ({
      id: String(item._id),
      targetType: item.targetType,
      targetId: String(item.targetId),
      category: item.category,
      description: item.description,
      status: item.status,
      createdAt: item.createdAt,
    })),
    total,
    page,
    pageSize,
  };
}

export async function resolveReport(principal, reportId, body) {
  await requireModerator(principal);
  requireObjectId(reportId, 'report');
  const report = await ResourceReport.findById(reportId);
  if (!report || String(report.departmentId) !== String(principal.departmentId)) {
    throw new NotFoundError('Report not found');
  }
  const status = body?.status;
  if (!['RESOLVED', 'DISMISSED'].includes(status)) {
    throw new ValidationError('Invalid report resolution');
  }
  report.status = status;
  report.resolvedByUserId = principal.userId;
  report.resolvedAt = new Date();
  report.resolutionNote = String(body.resolutionNote || '').trim();
  await report.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'study-room.report.resolve',
    entityType: 'ResourceReport',
    entityId: report._id,
    metadata: { status },
  });
  return { id: String(report._id), status: report.status };
}

export async function reconcileStudyRoom(principal) {
  const { settings } = await requireModerator(principal);
  const available = await SharedResource.find({
    departmentId: settings.departmentId,
    moderationState: 'AVAILABLE',
    deletedAt: null,
  })
    .select('fileId')
    .limit(200)
    .lean();
  const files = await StoredFile.find({ _id: { $in: available.map((row) => row.fileId) } })
    .select('scanStatus')
    .lean();
  const byId = new Map(files.map((file) => [String(file._id), file]));
  const issues = [];
  for (const resource of available) {
    const file = byId.get(String(resource.fileId));
    if (!file || file.scanStatus !== 'SAFE') {
      issues.push({
        issue: 'AVAILABLE_WITHOUT_SAFE_FILE',
        entity: 'SharedResource',
        entityId: String(resource._id),
        recommendedAction: 'This shared file is marked available but is not a safe scanned file. This report does not remove it and does not read chat.',
      });
    }
  }
  const openReports = await ResourceReport.find({
    departmentId: settings.departmentId,
    status: 'OPEN',
    targetType: 'RESOURCE',
  })
    .select('targetId')
    .limit(200)
    .lean();
  if (openReports.length) {
    const targets = await SharedResource.find({
      _id: { $in: openReports.map((report) => report.targetId) },
    })
      .select('moderationState deletedAt')
      .lean();
    const resources = new Map(targets.map((resource) => [String(resource._id), resource]));
    for (const report of openReports) {
      const resource = resources.get(String(report.targetId));
      if (resource && (resource.moderationState === 'REMOVED' || resource.deletedAt)) {
        issues.push({
          issue: 'OPEN_REPORT_FOR_REMOVED_RESOURCE',
          entity: 'ResourceReport',
          entityId: String(report._id),
          recommendedAction: 'This open report points at a resource that is already removed. This report does not close it and does not read chat.',
        });
      }
    }
  }
  return {
    issues,
    issueCount: issues.length,
    note: 'Department administrators can moderate shared files. They cannot read Study Room messages.',
  };
}

export { getOrCreateSettings };
