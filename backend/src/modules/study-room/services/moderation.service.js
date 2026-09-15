import { SharedResource, ResourceReport } from '../models/index.js';
import { StoredFile } from '../../files/index.js';
import { recordAudit as persistAudit } from '../../audit-security/services/record-audit.service.js';
import { ValidationError, NotFoundError } from '../../../shared/errors/app-error.js';
import { requireModerator, getOrCreateSettings } from './access.service.js';
import { canTransitionResource } from '../policies/study-room.policies.js';
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

export async function listModerationQueue(principal, query) {
  await requireModerator(principal);
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

export { getOrCreateSettings };
