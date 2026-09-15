import { createHash, randomUUID } from 'node:crypto';
import { OfficialResource } from '../models/official-resource.model.js';
import { ResourceSection } from '../models/resource-section.model.js';
import { RESOURCE_CATEGORIES } from '../constants.js';
import {
  SubjectOffering,
  LecturerAssignment,
  StudentAcademicContext,
  StudentAcademicHistory,
  findAssignment,
} from '../../academic-foundation/index.js';
import { StoredFile } from '../../files/index.js';
import {
  enqueueMalwareScan,
  processMalwareScan,
  detectOfficialContentType,
  assertAllowedOfficialType,
  sanitizeDisplayFilename,
} from '../../files/index.js';
import { User } from '../../authentication/models/user.model.js';
import { recordAudit as persistAudit } from '../../audit-security/services/record-audit.service.js';
import { Notification } from '../../notifications/index.js';
import { CalendarEvent } from '../../notices-calendar/index.js';
import { ROLES } from '../../../shared/constants/roles.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  ValidationError,
} from '../../../shared/errors/app-error.js';
import {
  canManageOfferingResources,
  canStudentAccessOffering,
  isStudentVisibleResource,
} from '../policies/learning.policies.js';
import { escapeRegex, parsePagination, requireObjectId } from '../utils/http.js';
import { mapOfferingSummary, mapResource, mapSection } from '../mappers/learning.mappers.js';

async function recordAudit({ actorUserId, action, entityId, metadata }) {
  await persistAudit({
    actorUserId,
    action,
    entityType: 'OfficialResource',
    entityId,
    metadata,
  });
}

async function loadOffering(offeringId) {
  requireObjectId(offeringId, 'offering');
  const offering = await SubjectOffering.findById(offeringId).populate('subjectId', 'code name');
  if (!offering) {
    throw new NotFoundError('Subject offering not found');
  }
  return offering;
}

async function assertCanManage(principal, offering) {
  const assignment =
    principal.role === ROLES.LECTURER
      ? await findAssignment(principal.userId, offering._id)
      : null;
  if (!canManageOfferingResources(principal, offering, assignment)) {
    throw new ForbiddenError('Forbidden');
  }
}

async function studentEntitlement(principal, offering) {
  if (principal.role !== ROLES.STUDENT) {
    return false;
  }
  const context = await StudentAcademicContext.findOne({ userId: principal.userId });
  const history = context
    ? await StudentAcademicHistory.find({ studentAcademicContextId: context._id })
    : [];
  return canStudentAccessOffering(principal, context, offering, history);
}

async function assertCanViewOffering(principal, offering) {
  if (principal.role === ROLES.DEPARTMENT_ADMINISTRATOR) {
    if (String(principal.departmentId) !== String(offering.departmentId)) {
      throw new NotFoundError('Subject offering not found');
    }
    return { operational: true };
  }
  if (principal.role === ROLES.LECTURER) {
    await assertCanManage(principal, offering);
    return { operational: true };
  }
  if (await studentEntitlement(principal, offering)) {
    return { operational: false };
  }
  throw new NotFoundError('Subject offering not found');
}

export async function listAccessibleOfferings(principal, query = {}) {
  const historical = query.scope === 'history';

  if (principal.role === ROLES.LECTURER) {
    const assignments = await LecturerAssignment.find({
      lecturerUserId: principal.userId,
      isActive: true,
    });
    const offerings = await SubjectOffering.find({
      _id: { $in: assignments.map((item) => item.subjectOfferingId) },
    }).populate('subjectId', 'code name');
    return { items: offerings.map((item) => mapOfferingSummary(item)), scope: 'assigned' };
  }

  if (principal.role === ROLES.DEPARTMENT_ADMINISTRATOR) {
    if (!principal.departmentId) {
      throw new ValidationError('Department is not configured for this administrator');
    }
    const { skip, limit, page, pageSize } = parsePagination(query);
    const filter = { departmentId: principal.departmentId };
    const [items, total] = await Promise.all([
      SubjectOffering.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('subjectId', 'code name'),
      SubjectOffering.countDocuments(filter),
    ]);
    return { items: items.map((item) => mapOfferingSummary(item)), total, page, pageSize, scope: 'department' };
  }

  if (principal.role !== ROLES.STUDENT) {
    throw new ForbiddenError('Forbidden');
  }

  const context = await StudentAcademicContext.findOne({ userId: principal.userId, status: 'ACTIVE' });
  if (!context) {
    return { items: [], scope: historical ? 'history' : 'current' };
  }

  if (!historical) {
    const offerings = await SubjectOffering.find({
      departmentId: context.departmentId,
      batchId: context.batchId,
      academicYearId: context.currentAcademicYearId,
      semesterId: context.currentSemesterId,
    }).populate('subjectId', 'code name');
    return { items: offerings.map((item) => mapOfferingSummary(item)), scope: 'current' };
  }

  const history = await StudentAcademicHistory.find({ studentAcademicContextId: context._id });
  const keys = history.map((row) => ({
    academicYearId: row.academicYearId,
    semesterId: row.semesterId,
  }));
  if (!keys.length) {
    return { items: [], scope: 'history' };
  }
  const offerings = await SubjectOffering.find({
    departmentId: context.departmentId,
    batchId: context.batchId,
    $or: keys,
  }).populate('subjectId', 'code name');
  return { items: offerings.map((item) => mapOfferingSummary(item)), scope: 'history' };
}

export async function getOfferingLearningPage(principal, offeringId) {
  const offering = await loadOffering(offeringId);
  const access = await assertCanViewOffering(principal, offering);
  const assignments = await LecturerAssignment.find({
    subjectOfferingId: offering._id,
    isActive: true,
  });
  const lecturers = await User.find({ _id: { $in: assignments.map((item) => item.lecturerUserId) } }).select(
    'displayName email',
  );
  const sections = await ResourceSection.find({ subjectOfferingId: offering._id }).sort({ sortOrder: 1, name: 1 });
  return {
    offering: mapOfferingSummary(offering),
    lecturers: lecturers.map((user) => ({
      id: String(user._id),
      displayName: user.displayName || user.email,
    })),
    sections: sections.map(mapSection),
    operational: access.operational,
  };
}

export async function listSections(principal, offeringId) {
  const offering = await loadOffering(offeringId);
  await assertCanViewOffering(principal, offering);
  const sections = await ResourceSection.find({ subjectOfferingId: offering._id }).sort({ sortOrder: 1, name: 1 });
  return { items: sections.map(mapSection) };
}

export async function createSection(principal, offeringId, body) {
  const offering = await loadOffering(offeringId);
  await assertCanManage(principal, offering);
  const name = String(body.name || '').trim();
  if (!name) {
    throw new ValidationError('Section name is required');
  }
  const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;
  const section = await ResourceSection.create({
    departmentId: offering.departmentId,
    subjectOfferingId: offering._id,
    name,
    sortOrder,
  });
  await recordAudit({
    actorUserId: principal.userId,
    action: 'learning.section.create',
    entityId: section._id,
    metadata: { subjectOfferingId: String(offering._id) },
  });
  return mapSection(section);
}

export async function updateSection(principal, sectionId, body) {
  requireObjectId(sectionId, 'section');
  const section = await ResourceSection.findById(sectionId);
  if (!section) {
    throw new NotFoundError('Section not found');
  }
  const offering = await loadOffering(section.subjectOfferingId);
  await assertCanManage(principal, offering);
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) {
      throw new ValidationError('Section name is required');
    }
    section.name = name;
  }
  if (body.sortOrder !== undefined) {
    section.sortOrder = Number(body.sortOrder) || 0;
  }
  await section.save();
  return mapSection(section);
}

async function storeOfficialFile({ buffer, originalname, mimetype, principal, offering, config, infrastructure }) {
  const maxBytes = config.files?.maxBytes || 20 * 1024 * 1024;
  if (!buffer || !buffer.length) {
    throw new ValidationError('File is required');
  }
  if (buffer.length > maxBytes) {
    throw new PayloadTooLargeError('File exceeds the official resource size limit');
  }
  const displayFilename = sanitizeDisplayFilename(originalname);
  const detectedType = detectOfficialContentType(buffer, mimetype);
  assertAllowedOfficialType(detectedType);
  const storageKey = `official/${offering._id}/${randomUUID()}`;
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
    owningDomain: 'OFFICIAL_RESOURCE',
    owningContextId: offering._id,
    scanStatus: 'SCANNING',
    reviewStatus: 'NOT_REQUIRED',
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

export async function createResource(principal, offeringId, body, file, { config, infrastructure }) {
  const offering = await loadOffering(offeringId);
  await assertCanManage(principal, offering);
  requireObjectId(body.sectionId, 'section');
  const section = await ResourceSection.findById(body.sectionId);
  if (!section || String(section.subjectOfferingId) !== String(offering._id)) {
    throw new NotFoundError('Section not found');
  }
  const title = String(body.title || '').trim();
  if (!title) {
    throw new ValidationError('Title is required');
  }
  const category = body.category || 'OTHER';
  if (!RESOURCE_CATEGORIES.includes(category)) {
    throw new ValidationError('Invalid resource category');
  }
  const stored = await storeOfficialFile({
    buffer: file?.buffer,
    originalname: file?.originalname,
    mimetype: file?.mimetype,
    principal,
    offering,
    config,
    infrastructure,
  });
  const resource = await OfficialResource.create({
    departmentId: offering.departmentId,
    subjectOfferingId: offering._id,
    sectionId: section._id,
    createdByUserId: principal.userId,
    updatedByUserId: principal.userId,
    fileId: stored._id,
    title,
    description: String(body.description || '').trim(),
    category,
    publicationState: 'DRAFT',
    sortOrder: Number(body.sortOrder) || 0,
    version: 1,
    deadlineAt: body.deadlineAt ? new Date(body.deadlineAt) : undefined,
  });
  await recordAudit({
    actorUserId: principal.userId,
    action: 'learning.resource.create',
    entityId: resource._id,
    metadata: { subjectOfferingId: String(offering._id), fileId: String(stored._id) },
  });
  return mapResource(resource, { file: stored, includeOperational: true });
}

export async function listResources(principal, offeringId, query = {}) {
  const offering = await loadOffering(offeringId);
  const access = await assertCanViewOffering(principal, offering);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { subjectOfferingId: offering._id, deletedAt: { $exists: false } };
  if (!access.operational) {
    filter.publicationState = 'PUBLISHED';
  } else if (query.publicationState && query.publicationState !== 'ALL') {
    filter.publicationState = query.publicationState;
  }
  if (query.sectionId) {
    requireObjectId(query.sectionId, 'section');
    filter.sectionId = query.sectionId;
  }
  if (query.category && RESOURCE_CATEGORIES.includes(query.category)) {
    filter.category = query.category;
  }
  if (query.q) {
    filter.title = new RegExp(`^${escapeRegex(query.q)}`, 'i');
  }
  const [items, total] = await Promise.all([
    OfficialResource.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(limit),
    OfficialResource.countDocuments(filter),
  ]);
  const files = await StoredFile.find({ _id: { $in: items.map((item) => item.fileId) } });
  const fileById = new Map(files.map((file) => [String(file._id), file]));
  const mapped = items
    .map((item) => {
      const file = fileById.get(String(item.fileId));
      if (!access.operational && !isStudentVisibleResource(item, file)) {
        return null;
      }
      return mapResource(item, { file, includeOperational: access.operational });
    })
    .filter(Boolean);
  return { items: mapped, total, page, pageSize };
}

async function loadManagedResource(principal, resourceId, { studentOk = false } = {}) {
  requireObjectId(resourceId, 'resource');
  const resource = await OfficialResource.findById(resourceId);
  if (!resource || resource.deletedAt) {
    throw new NotFoundError('Resource not found');
  }
  const offering = await loadOffering(resource.subjectOfferingId);
  if (principal.role === ROLES.STUDENT) {
    if (!studentOk || !(await studentEntitlement(principal, offering))) {
      throw new NotFoundError('Resource not found');
    }
    return { resource, offering, operational: false };
  }
  await assertCanManage(principal, offering);
  return { resource, offering, operational: true };
}

export async function getResource(principal, resourceId) {
  const { resource, operational } = await loadManagedResource(principal, resourceId, { studentOk: true });
  const file = await StoredFile.findById(resource.fileId);
  if (!operational && !isStudentVisibleResource(resource, file)) {
    throw new NotFoundError('Resource not found');
  }
  return mapResource(resource, { file, includeOperational: operational });
}

export async function updateResourceMetadata(principal, resourceId, body) {
  const { resource } = await loadManagedResource(principal, resourceId);
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) {
      throw new ValidationError('Title is required');
    }
    resource.title = title;
  }
  if (body.description !== undefined) {
    resource.description = String(body.description).trim();
  }
  if (body.category !== undefined) {
    if (!RESOURCE_CATEGORIES.includes(body.category)) {
      throw new ValidationError('Invalid resource category');
    }
    resource.category = body.category;
  }
  if (body.sortOrder !== undefined) {
    resource.sortOrder = Number(body.sortOrder) || 0;
  }
  if (body.sectionId !== undefined) {
    requireObjectId(body.sectionId, 'section');
    const section = await ResourceSection.findById(body.sectionId);
    if (!section || String(section.subjectOfferingId) !== String(resource.subjectOfferingId)) {
      throw new NotFoundError('Section not found');
    }
    resource.sectionId = section._id;
  }
  if (body.publicationState !== undefined) {
    throw new ValidationError('Use the publish or unpublish action');
  }
  resource.updatedByUserId = principal.userId;
  await resource.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'learning.resource.update',
    entityId: resource._id,
  });
  const file = await StoredFile.findById(resource.fileId);
  return mapResource(resource, { file, includeOperational: true });
}

async function notifyOfferingStudents(offering, resource) {
  const students = await StudentAcademicContext.find({
    departmentId: offering.departmentId,
    batchId: offering.batchId,
    currentAcademicYearId: offering.academicYearId,
    currentSemesterId: offering.semesterId,
    status: 'ACTIVE',
  }).select('userId');
  if (!students.length) {
    return;
  }
  const docs = students.map((student) => ({
    recipientUserId: student.userId,
    type: 'OFFICIAL_RESOURCE_PUBLISHED',
    sourceModule: 'learning-environment',
    sourceId: String(resource._id),
    channel: 'IN_APP',
    status: 'PENDING',
    idempotencyKey: `${student.userId}:${resource._id}:v${resource.version}:publish`,
  }));
  await Notification.insertMany(docs, { ordered: false }).catch((error) => {
    if (error.code !== 11000) {
      throw error;
    }
  });
}

export async function publishResource(principal, resourceId) {
  const { resource, offering } = await loadManagedResource(principal, resourceId);
  const file = await StoredFile.findById(resource.fileId);
  if (!file || file.scanStatus !== 'SAFE') {
    throw new ConflictError('Resource cannot be published until the file has passed security scanning');
  }
  if (resource.publicationState === 'PUBLISHED') {
    return mapResource(resource, { file, includeOperational: true });
  }
  file.availability = 'AVAILABLE';
  await file.save();
  resource.publicationState = 'PUBLISHED';
  resource.publishedAt = new Date();
  resource.unpublishedAt = undefined;
  resource.publishedByUserId = principal.userId;
  resource.updatedByUserId = principal.userId;
  if (resource.deadlineAt && !resource.calendarEventId) {
    const event = await CalendarEvent.create({
      title: resource.title,
      details: 'Official resource deadline',
      startsAt: resource.deadlineAt,
      createdByUserId: principal.userId,
      eventType: 'ASSIGNMENT_DEADLINE',
      batchId: offering.batchId,
      academicYearId: offering.academicYearId,
      semesterId: offering.semesterId,
      subjectOfferingId: offering._id,
    });
    resource.calendarEventId = event._id;
  }
  await resource.save();
  await notifyOfferingStudents(offering, resource);
  await recordAudit({
    actorUserId: principal.userId,
    action: 'learning.resource.publish',
    entityId: resource._id,
    metadata: { subjectOfferingId: String(offering._id) },
  });
  return mapResource(resource, { file, includeOperational: true });
}

export async function unpublishResource(principal, resourceId) {
  const { resource } = await loadManagedResource(principal, resourceId);
  const file = await StoredFile.findById(resource.fileId);
  if (resource.publicationState !== 'PUBLISHED') {
    return mapResource(resource, { file, includeOperational: true });
  }
  resource.publicationState = 'UNPUBLISHED';
  resource.unpublishedAt = new Date();
  resource.updatedByUserId = principal.userId;
  if (file) {
    file.availability = 'UNAVAILABLE';
    await file.save();
  }
  await resource.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'learning.resource.unpublish',
    entityId: resource._id,
  });
  return mapResource(resource, { file, includeOperational: true });
}

export async function replaceResourceFile(principal, resourceId, file, { config, infrastructure }) {
  const { resource, offering } = await loadManagedResource(principal, resourceId);
  const stored = await storeOfficialFile({
    buffer: file?.buffer,
    originalname: file?.originalname,
    mimetype: file?.mimetype,
    principal,
    offering,
    config,
    infrastructure,
  });
  resource.previousFileId = resource.fileId;
  resource.fileId = stored._id;
  resource.version += 1;
  resource.publicationState = 'DRAFT';
  resource.publishedAt = undefined;
  resource.updatedByUserId = principal.userId;
  await resource.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'learning.resource.replace',
    entityId: resource._id,
    metadata: { fileId: String(stored._id), version: resource.version },
  });
  return mapResource(resource, { file: stored, includeOperational: true });
}

export async function archiveResource(principal, resourceId) {
  const { resource } = await loadManagedResource(principal, resourceId);
  resource.deletedAt = new Date();
  resource.publicationState = 'UNPUBLISHED';
  resource.updatedByUserId = principal.userId;
  await resource.save();
  const file = await StoredFile.findById(resource.fileId);
  if (file) {
    file.availability = 'UNAVAILABLE';
    await file.save();
  }
  await recordAudit({
    actorUserId: principal.userId,
    action: 'learning.resource.archive',
    entityId: resource._id,
  });
  return mapResource(resource, { file, includeOperational: true });
}

export async function downloadResource(principal, resourceId, { infrastructure }) {
  const { resource, operational } = await loadManagedResource(principal, resourceId, { studentOk: true });
  const file = await StoredFile.findById(resource.fileId);
  if (!operational && !isStudentVisibleResource(resource, file)) {
    throw new NotFoundError('Resource not found');
  }
  if (!file || file.scanStatus !== 'SAFE' || !infrastructure.storage?.getObject) {
    if (!operational) {
      throw new NotFoundError('Resource not found');
    }
    throw new ConflictError('File is not available for download');
  }
  if (!operational && (file.availability !== 'AVAILABLE' || resource.publicationState !== 'PUBLISHED')) {
    throw new NotFoundError('Resource not found');
  }
  const object = await infrastructure.storage.getObject(file.storageKey);
  return {
    body: object.body,
    mimeType: file.mimeType,
    displayFilename: file.displayFilename,
  };
}

export async function listDepartmentResources(principal, query = {}) {
  if (principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR || !principal.departmentId) {
    throw new ForbiddenError('Forbidden');
  }
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { departmentId: principal.departmentId, deletedAt: { $exists: false } };
  if (query.subjectOfferingId) {
    requireObjectId(query.subjectOfferingId, 'offering');
    filter.subjectOfferingId = query.subjectOfferingId;
  }
  if (query.publicationState && query.publicationState !== 'ALL') {
    filter.publicationState = query.publicationState;
  }
  const [items, total] = await Promise.all([
    OfficialResource.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    OfficialResource.countDocuments(filter),
  ]);
  const files = await StoredFile.find({ _id: { $in: items.map((item) => item.fileId) } });
  const fileById = new Map(files.map((file) => [String(file._id), file]));
  return {
    items: items.map((item) =>
      mapResource(item, { file: fileById.get(String(item.fileId)), includeOperational: true }),
    ),
    total,
    page,
    pageSize,
  };
}
