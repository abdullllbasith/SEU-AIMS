import { createHash, randomUUID } from 'node:crypto';
import { SharedFolder, SharedResource, ResourceReport } from '../models/index.js';
import { StoredFile } from '../../files/index.js';
import {
  enqueueMalwareScan,
  processMalwareScan,
  detectOfficialContentType,
  assertAllowedOfficialType,
  sanitizeDisplayFilename,
} from '../../files/index.js';
import { recordAudit as persistAudit } from '../../audit-security/services/record-audit.service.js';
import { PayloadTooLargeError, ValidationError } from '../../../shared/errors/app-error.js';
import { User } from '../../authentication/models/user.model.js';
import { requireStudentScope, conceal, getOrCreateSettings } from './access.service.js';
import {
  canManageSharedItem,
  canTransitionResource,
  isStudentDownloadable,
  studentStatusLabel,
} from '../policies/study-room.policies.js';
import { mapFolder, mapResource } from '../mappers/study-room.mappers.js';
import { escapeRegex, parsePagination, requireObjectId } from '../utils/http.js';
import { REPORT_CATEGORIES } from '../constants.js';

async function attachCreators(items) {
  const ids = [...new Set(items.map((item) => item.createdByUserId).filter(Boolean))];
  const users = ids.length ? await User.find({ _id: { $in: ids } }).select('displayName') : [];
  const names = new Map(users.map((user) => [String(user._id), user.displayName || 'Classmate']));
  return items.map((item) => ({
    ...item,
    createdByDisplayName: names.get(String(item.createdByUserId)) || 'Classmate',
  }));
}

async function presentFolder(folder) {
  const [item] = await attachCreators([mapFolder(folder)]);
  return item;
}

function presentResource(resource, file) {
  return {
    ...mapResource(resource, { file, includeOperational: false }),
    studentStatusLabel: studentStatusLabel(resource.moderationState),
    downloadable: isStudentDownloadable(resource, file),
  };
}

async function recordAudit({ actorUserId, action, entityId, entityType, metadata }) {
  await persistAudit({
    actorUserId,
    action,
    entityType,
    entityId,
    metadata,
  });
}

async function loadFolderForStudent(principal, folderId, context) {
  requireObjectId(folderId, 'folder');
  const folder = await SharedFolder.findById(folderId);
  if (
    !folder ||
    folder.deletedAt ||
    String(folder.batchId) !== String(context.batchId) ||
    String(folder.departmentId) !== String(context.departmentId)
  ) {
    throw conceal('Folder');
  }
  return folder;
}

export async function listFolders(principal, query) {
  const { context } = await requireStudentScope(principal);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = {
    departmentId: context.departmentId,
    batchId: context.batchId,
    deletedAt: { $exists: false },
    status: 'ACTIVE',
  };
  if (query.q) {
    filter.name = new RegExp(escapeRegex(query.q), 'i');
  }
  const [items, total] = await Promise.all([
    SharedFolder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    SharedFolder.countDocuments(filter),
  ]);
  return { items: await attachCreators(items.map(mapFolder)), total, page, pageSize };
}

export async function createFolder(principal, body) {
  const { context } = await requireStudentScope(principal);
  const name = String(body?.name || '').trim();
  if (!name) {
    throw new ValidationError('Folder name is required');
  }
  const folder = await SharedFolder.create({
    departmentId: context.departmentId,
    batchId: context.batchId,
    createdByUserId: principal.userId,
    name,
    description: String(body.description || '').trim(),
    visibility: 'COMMON',
  });
  await recordAudit({
    actorUserId: principal.userId,
    action: 'study-room.folder.create',
    entityType: 'SharedFolder',
    entityId: folder._id,
    metadata: { batchId: String(context.batchId) },
  });
  return presentFolder(folder);
}

export async function getFolder(principal, folderId) {
  const { context } = await requireStudentScope(principal);
  const folder = await loadFolderForStudent(principal, folderId, context);
  return presentFolder(folder);
}

export async function updateFolder(principal, folderId, body) {
  const { context } = await requireStudentScope(principal);
  const folder = await loadFolderForStudent(principal, folderId, context);
  if (!canManageSharedItem(folder)) {
    throw conceal('Folder');
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) {
      throw new ValidationError('Folder name is required');
    }
    folder.name = name;
  }
  if (body.description !== undefined) {
    folder.description = String(body.description).trim();
  }
  await folder.save();
  return presentFolder(folder);
}

export async function archiveFolder(principal, folderId) {
  const { context } = await requireStudentScope(principal);
  const folder = await loadFolderForStudent(principal, folderId, context);
  if (!canManageSharedItem(folder)) {
    throw conceal('Folder');
  }
  folder.deletedAt = new Date();
  folder.status = 'ARCHIVED';
  await folder.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'study-room.folder.archive',
    entityType: 'SharedFolder',
    entityId: folder._id,
  });
  return { archived: true };
}

export async function listResources(principal, folderId, query) {
  const { context } = await requireStudentScope(principal);
  const folder = await loadFolderForStudent(principal, folderId, context);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { folderId: folder._id, deletedAt: { $exists: false } };
  if (query.q) {
    filter.title = new RegExp(escapeRegex(query.q), 'i');
  }
  const [items, total] = await Promise.all([
    SharedResource.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    SharedResource.countDocuments(filter),
  ]);
  const files = await StoredFile.find({ _id: { $in: items.map((item) => item.fileId) } });
  const fileById = new Map(files.map((file) => [String(file._id), file]));
  const mapped = items.map((item) => {
    const file = fileById.get(String(item.fileId));
    return presentResource(item, file);
  });
  return { items: await attachCreators(mapped), total, page, pageSize };
}

async function storeStudyRoomFile({ buffer, originalname, mimetype, principal, folder, config, infrastructure }) {
  const maxBytes = config.files?.maxBytes || 20 * 1024 * 1024;
  if (!buffer || !buffer.length) {
    throw new ValidationError('File is required');
  }
  if (buffer.length > maxBytes) {
    throw new PayloadTooLargeError('File exceeds the size limit');
  }
  const displayFilename = sanitizeDisplayFilename(originalname);
  const detectedType = detectOfficialContentType(buffer, mimetype);
  assertAllowedOfficialType(detectedType);
  const storageKey = `study-room/${folder._id}/${randomUUID()}`;
  const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
  if (!infrastructure.storage?.putObject) {
    throw new ValidationError('File storage is not configured');
  }
  await infrastructure.storage.putObject({ key: storageKey, body: buffer, contentType: detectedType });
  const file = await StoredFile.create({
    storageKey,
    originalFilename: displayFilename,
    displayFilename,
    mimeType: detectedType,
    sizeBytes: buffer.length,
    uploadedByUserId: principal.userId,
    owningDomain: 'STUDY_ROOM_RESOURCE',
    owningContextId: folder._id,
    scanStatus: 'SCANNING',
    reviewStatus: 'PENDING',
    availability: 'UNAVAILABLE',
    checksumSha256,
  });
  await enqueueMalwareScan({ queue: infrastructure.queue, fileId: file._id });
  if (infrastructure.malwareScanner) {
    await processMalwareScan({
      fileId: file._id,
      scanner: infrastructure.malwareScanner,
      logger: infrastructure.logger,
    });
  }
  return StoredFile.findById(file._id);
}

export async function uploadResource(principal, folderId, body, file, { config, infrastructure }) {
  const { context, settings } = await requireStudentScope(principal);
  const folder = await loadFolderForStudent(principal, folderId, context);
  const stored = await storeStudyRoomFile({
    buffer: file?.buffer,
    originalname: file?.originalname,
    mimetype: file?.mimetype,
    principal,
    folder,
    config,
    infrastructure,
  });
  let duplicateOfResourceId;
  if (stored.checksumSha256) {
    const sameFiles = await StoredFile.find({
      checksumSha256: stored.checksumSha256,
      owningDomain: 'STUDY_ROOM_RESOURCE',
      _id: { $ne: stored._id },
    });
    if (sameFiles.length) {
      const existing = await SharedResource.findOne({
        fileId: { $in: sameFiles.map((item) => item._id) },
        folderId: folder._id,
        deletedAt: { $exists: false },
      });
      duplicateOfResourceId = existing?._id;
    }
  }

  const resource = await SharedResource.create({
    departmentId: context.departmentId,
    batchId: context.batchId,
    folderId: folder._id,
    fileId: stored._id,
    createdByUserId: principal.userId,
    title: String(body?.title || stored.displayFilename).trim(),
    moderationState: 'SCANNING',
    reviewStatus: settings.moderationMode === 'NON_REVIEW' ? 'NOT_REQUIRED' : 'PENDING',
    duplicateOfResourceId,
  });
  await applyScanToResource(resource, stored, settings);
  await recordAudit({
    actorUserId: principal.userId,
    action: 'study-room.resource.upload',
    entityType: 'SharedResource',
    entityId: resource._id,
    metadata: { folderId: String(folder._id), duplicate: Boolean(duplicateOfResourceId) },
  });
  const fresh = await SharedResource.findById(resource._id);
  const freshFile = await StoredFile.findById(stored._id);
  const [presented] = await attachCreators([presentResource(fresh, freshFile)]);
  return {
    ...presented,
    duplicateOfResourceId: duplicateOfResourceId ? String(duplicateOfResourceId) : null,
  };
}

export async function applyScanToResource(resource, file, settings) {
  if (!resource || resource.deletedAt) {
    return resource;
  }
  let next;
  if (file.scanStatus === 'SAFE') {
    next = settings.moderationMode === 'NON_REVIEW' ? 'AVAILABLE' : 'PENDING_REVIEW';
  } else if (file.scanStatus === 'UNSAFE' || file.scanStatus === 'REJECTED') {
    next = 'SCAN_FAILED';
  } else {
    next = 'QUARANTINED';
  }
  if (resource.moderationState !== next && canTransitionResource(resource.moderationState, next)) {
    const previous = resource.moderationState;
    resource.moderationState = next;
    if (next === 'AVAILABLE') {
      resource.reviewStatus = settings.moderationMode === 'NON_REVIEW' ? 'NOT_REQUIRED' : resource.reviewStatus;
      file.availability = 'AVAILABLE';
      file.reviewStatus = resource.reviewStatus;
    } else {
      file.availability = 'UNAVAILABLE';
    }
    await resource.save();
    await file.save();
    await recordAudit({
      actorUserId: null,
      action: 'study-room.resource.scan-transition',
      entityType: 'SharedResource',
      entityId: resource._id,
      metadata: { previous, next, scanStatus: file.scanStatus },
    });
  } else if (resource.moderationState === 'SCANNING' && next === 'QUARANTINED') {
    resource.moderationState = 'QUARANTINED';
    file.availability = 'UNAVAILABLE';
    await resource.save();
    await file.save();
  }
  return resource;
}

export async function retryQuarantinedScans({ departmentId, infrastructure } = {}) {
  const scanner = infrastructure?.malwareScanner;
  if (!departmentId || !scanner?.scan || scanner.configured === false) {
    return 0;
  }
  const resources = await SharedResource.find({
    departmentId,
    moderationState: 'QUARANTINED',
    deletedAt: { $exists: false },
  }).select('fileId');
  let released = 0;
  for (const resource of resources) {
    const scanned = await processMalwareScan({
      fileId: resource.fileId,
      scanner,
      logger: infrastructure.logger,
    });
    if (!scanned || scanned.scanStatus === 'QUARANTINED') {
      break;
    }
    await syncSharedResourceAfterScan(resource.fileId);
    released += 1;
  }
  return released;
}

export async function syncSharedResourceAfterScan(fileId) {
  const file = await StoredFile.findById(fileId);
  if (!file || file.owningDomain !== 'STUDY_ROOM_RESOURCE') {
    return null;
  }
  const resource = await SharedResource.findOne({ fileId: file._id, deletedAt: { $exists: false } });
  if (!resource) {
    return null;
  }
  const settings = await getOrCreateSettings(resource.departmentId);
  return applyScanToResource(resource, file, settings);
}

export async function getResource(principal, resourceId) {
  const { context } = await requireStudentScope(principal);
  requireObjectId(resourceId, 'resource');
  const resource = await SharedResource.findById(resourceId);
  if (
    !resource ||
    resource.deletedAt ||
    String(resource.batchId) !== String(context.batchId)
  ) {
    throw conceal('Resource');
  }
  const file = await StoredFile.findById(resource.fileId);
  const [presented] = await attachCreators([presentResource(resource, file)]);
  return presented;
}

async function loadResourceForStudent(principal, resourceId, context) {
  requireObjectId(resourceId, 'resource');
  const resource = await SharedResource.findById(resourceId);
  if (
    !resource ||
    resource.deletedAt ||
    String(resource.batchId) !== String(context.batchId) ||
    String(resource.departmentId) !== String(context.departmentId)
  ) {
    throw conceal('Resource');
  }
  return resource;
}

export async function renameResource(principal, resourceId, body) {
  const { context } = await requireStudentScope(principal);
  const resource = await loadResourceForStudent(principal, resourceId, context);
  if (!canManageSharedItem(resource)) {
    throw conceal('Resource');
  }
  const requested = sanitizeDisplayFilename(body?.name);
  if (!requested) {
    throw new ValidationError('File name is required');
  }
  const file = await StoredFile.findById(resource.fileId);
  let next = requested;
  const currentName = file?.displayFilename || resource.title || '';
  if (!/\.[a-z0-9]{1,8}$/i.test(next)) {
    const extension = String(currentName).match(/(\.[a-z0-9]{1,8})$/i);
    if (extension) {
      next = `${next}${extension[1]}`;
    }
  }
  resource.title = next;
  if (file) {
    file.displayFilename = next;
    await file.save();
  }
  await resource.save();
  const [presented] = await attachCreators([presentResource(resource, file)]);
  return presented;
}

export async function deleteResource(principal, resourceId) {
  const { context } = await requireStudentScope(principal);
  const resource = await loadResourceForStudent(principal, resourceId, context);
  if (!canManageSharedItem(resource)) {
    throw conceal('Resource');
  }
  const file = await StoredFile.findById(resource.fileId);
  if (canTransitionResource(resource.moderationState, 'REMOVED')) {
    resource.moderationState = 'REMOVED';
  }
  resource.deletedAt = new Date();
  if (file) {
    file.availability = 'UNAVAILABLE';
    await file.save();
  }
  await resource.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'study-room.resource.delete',
    entityType: 'SharedResource',
    entityId: resource._id,
  });
  return { deleted: true };
}

export async function downloadResource(principal, resourceId, { infrastructure }) {
  const { context } = await requireStudentScope(principal);
  requireObjectId(resourceId, 'resource');
  const resource = await SharedResource.findById(resourceId);
  if (!resource || resource.deletedAt || String(resource.batchId) !== String(context.batchId)) {
    throw conceal('Resource');
  }
  const file = await StoredFile.findById(resource.fileId);
  if (!isStudentDownloadable(resource, file)) {
    throw conceal('Resource');
  }
  if (!infrastructure.storage?.getObject) {
    throw new ValidationError('File storage is not configured');
  }
  const object = await infrastructure.storage.getObject(file.storageKey);
  return {
    body: object.body,
    mimeType: file.mimeType,
    displayFilename: file.displayFilename,
  };
}

export async function reportTarget(principal, resourceId, body) {
  const { context } = await requireStudentScope(principal);
  requireObjectId(resourceId, 'resource');
  const resource = await SharedResource.findById(resourceId);
  if (!resource || String(resource.batchId) !== String(context.batchId)) {
    throw conceal('Resource');
  }
  const category = body?.category;
  if (!REPORT_CATEGORIES.includes(category)) {
    throw new ValidationError('Invalid report category');
  }
  const report = await ResourceReport.create({
    departmentId: context.departmentId,
    reporterUserId: principal.userId,
    targetType: 'RESOURCE',
    targetId: resource._id,
    category,
    description: String(body.description || '').trim(),
  });
  await recordAudit({
    actorUserId: principal.userId,
    action: 'study-room.report.create',
    entityType: 'ResourceReport',
    entityId: report._id,
    metadata: { targetId: String(resource._id), category },
  });
  return { id: String(report._id), status: report.status };
}
