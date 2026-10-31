import { createHash, randomUUID } from 'node:crypto';
import { Notice } from '../models/notice.model.js';
import {
  StoredFile,
  detectProfileImageType,
  enqueueMalwareScan,
  processMalwareScan,
  sanitizeDisplayFilename,
} from '../../files/index.js';
import { noticeVisibleToPrincipal, resolveNoticeRecipientIds } from './audience.service.js';
import {
  findStudentContextByUserId,
  SubjectOffering,
} from '../../academic-foundation/index.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { ForbiddenError, NotFoundError, PayloadTooLargeError, ValidationError } from '../../../shared/errors/app-error.js';
import { fanoutNotification } from '../../notifications/index.js';
import { recordAudit as persistAudit } from '../../audit-security/services/record-audit.service.js';
import { parsePagination, requireObjectId } from '../../notifications/utils/http.js';

function assertAdmin(principal) {
  if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR || !principal.departmentId) {
    throw new ForbiddenError('Forbidden');
  }
}

const NOTICE_IMAGE_LIMIT = 8;
const NOTICE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

function mapNotice(doc) {
  const images = [...(doc.images || [])]
    .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0))
    .map((image) => ({
      id: String(image._id),
      sortOrder: image.sortOrder || 0,
      url: `/api/notices/${doc._id}/images/${image._id}`,
    }));
  return {
    id: String(doc._id),
    title: doc.title,
    body: doc.body,
    publicationState: doc.publicationState,
    priority: doc.priority,
    publishedAt: doc.publishedAt || null,
    expiresAt: doc.expiresAt || null,
    targeting: doc.targeting,
    images,
  };
}

async function subjectMatch(context, subjectId) {
  if (!context || !subjectId) {
    return false;
  }
  const offering = await SubjectOffering.findOne({
    subjectId,
    batchId: context.batchId,
    academicYearId: context.currentAcademicYearId,
    semesterId: context.currentSemesterId,
  });
  return Boolean(offering);
}

export async function listNotices(principal, query = {}) {
  const { skip, limit, page, pageSize } = parsePagination(query);
  const contextDoc = principal.role === ROLES.STUDENT ? await findStudentContextByUserId(principal.userId) : null;
  const context = contextDoc && typeof contextDoc.toObject === 'function' ? contextDoc.toObject() : contextDoc;
  const filter = {};
  if (principal.role === ROLES.DEPARTMENT_ADMINISTRATOR) {
    filter.departmentId = principal.departmentId;
    if (query.publicationState) {
      filter.publicationState = String(query.publicationState);
    }
  } else {
    filter.departmentId = principal.departmentId;
    filter.publicationState = 'PUBLISHED';
    filter.$or = [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }];
  }
  const candidates = await Notice.find(filter).sort({ publishedAt: -1, createdAt: -1 }).skip(skip).limit(limit);
  const items = [];
  for (const notice of candidates) {
    const match = await subjectMatch(context, notice.targeting?.subjectId);
    if (noticeVisibleToPrincipal(notice, principal, context ? { ...context, subjectMatch: match } : null)) {
      items.push(mapNotice(notice));
    }
  }
  return { items, page, pageSize };
}

export async function getNotice(principal, noticeId) {
  requireObjectId(noticeId, 'notice');
  const notice = await Notice.findById(noticeId);
  if (!notice) {
    throw new NotFoundError('Notice not found');
  }
  if (!principal?.departmentId || String(notice.departmentId) !== String(principal.departmentId)) {
    throw new NotFoundError('Notice not found');
  }
  const contextDoc = principal.role === ROLES.STUDENT ? await findStudentContextByUserId(principal.userId) : null;
  const context = contextDoc && typeof contextDoc.toObject === 'function' ? contextDoc.toObject() : contextDoc;
  const match = await subjectMatch(context, notice.targeting?.subjectId);
  if (!noticeVisibleToPrincipal(notice, principal, context ? { ...context, subjectMatch: match } : null)) {
    throw new NotFoundError('Notice not found');
  }
  if (principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR && notice.publicationState !== 'PUBLISHED') {
    throw new NotFoundError('Notice not found');
  }
  return mapNotice(notice);
}

export async function createNotice(principal, body) {
  assertAdmin(principal);
  const title = String(body.title || '').trim();
  const noticeBody = String(body.body || '').trim();
  if (!title || !noticeBody) {
    throw new ValidationError('Title and body are required');
  }
  const kind = String(body.targeting?.kind || 'ALL_STUDENTS');
  const notice = await Notice.create({
    departmentId: principal.departmentId,
    publisherUserId: principal.userId,
    title,
    body: noticeBody,
    priority: body.priority === 'HIGH' ? 'HIGH' : 'NORMAL',
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    targeting: {
      kind,
      batchId: body.targeting?.batchId,
      academicYearId: body.targeting?.academicYearId,
      semesterId: body.targeting?.semesterId,
      subjectId: body.targeting?.subjectId,
      role: body.targeting?.role,
    },
  });
  await persistAudit({
    actorUserId: principal.userId,
    action: 'notice.create',
    entityType: 'Notice',
    entityId: String(notice._id),
    metadata: { title },
    occurredAt: new Date(),
  });
  return mapNotice(notice);
}

export async function addNoticeImage(principal, noticeId, file, { infrastructure }) {
  assertAdmin(principal);
  requireObjectId(noticeId, 'notice');
  const notice = await Notice.findOne({ _id: noticeId, departmentId: principal.departmentId });
  if (!notice) {
    throw new NotFoundError('Notice not found');
  }
  if (notice.publicationState === 'ARCHIVED') {
    throw new ValidationError('Photos cannot be changed after the notice is withdrawn');
  }
  if ((notice.images || []).length >= NOTICE_IMAGE_LIMIT) {
    throw new ValidationError('A notice can include up to 8 photos');
  }
  const buffer = file?.buffer;
  if (!buffer?.length) {
    throw new ValidationError('File is required');
  }
  if (buffer.length > NOTICE_IMAGE_MAX_BYTES) {
    throw new PayloadTooLargeError('Each notice photo must be 4 MB or smaller');
  }
  const detectedType = detectProfileImageType(buffer);
  const displayFilename = sanitizeDisplayFilename(file.originalname || 'notice-photo');
  if (!infrastructure?.storage?.putObject) {
    throw new ValidationError('File storage is not configured');
  }
  const storageKey = `notices/${notice._id}/${randomUUID()}`;
  await infrastructure.storage.putObject({ key: storageKey, body: buffer, contentType: detectedType });
  const stored = await StoredFile.create({
    storageKey,
    originalFilename: displayFilename,
    displayFilename,
    mimeType: detectedType,
    sizeBytes: buffer.length,
    uploadedByUserId: principal.userId,
    owningDomain: 'NOTICE_IMAGE',
    owningContextId: notice._id,
    scanStatus: 'SCANNING',
    reviewStatus: 'NOT_REQUIRED',
    availability: 'UNAVAILABLE',
    checksumSha256: createHash('sha256').update(buffer).digest('hex'),
  });
  await enqueueMalwareScan({ queue: infrastructure.queue, fileId: stored._id });
  if (infrastructure.malwareScanner) {
    await processMalwareScan({
      fileId: stored._id,
      scanner: infrastructure.malwareScanner,
      logger: infrastructure.logger,
    });
  }
  const scanned = await StoredFile.findById(stored._id);
  if (!scanned || scanned.scanStatus !== 'SAFE') {
    throw new ValidationError('This photo could not be accepted');
  }
  scanned.availability = 'AVAILABLE';
  await scanned.save();
  notice.images.push({ fileId: scanned._id, sortOrder: notice.images.length });
  await notice.save();
  return mapNotice(notice);
}

export async function readNoticeImage(principal, noticeId, imageId, { infrastructure }) {
  requireObjectId(imageId, 'image');
  await getNotice(principal, noticeId);
  const notice = await Notice.findById(noticeId);
  const image = (notice?.images || []).find((item) => String(item._id) === String(imageId));
  if (!image) {
    throw new NotFoundError('Notice photo not found');
  }
  const file = await StoredFile.findById(image.fileId);
  if (!file || file.owningDomain !== 'NOTICE_IMAGE' || file.scanStatus !== 'SAFE' || file.availability !== 'AVAILABLE') {
    throw new NotFoundError('Notice photo not found');
  }
  if (!infrastructure?.storage?.getObject) {
    throw new ValidationError('File storage is not configured');
  }
  const object = await infrastructure.storage.getObject(file.storageKey);
  return { mimeType: file.mimeType, body: object?.body || Buffer.from('') };
}

export async function removeNoticeImage(principal, noticeId, imageId) {
  assertAdmin(principal);
  requireObjectId(noticeId, 'notice');
  requireObjectId(imageId, 'image');
  const notice = await Notice.findOne({ _id: noticeId, departmentId: principal.departmentId });
  if (!notice) {
    throw new NotFoundError('Notice not found');
  }
  if (notice.publicationState === 'ARCHIVED') {
    throw new ValidationError('Photos cannot be changed after the notice is withdrawn');
  }
  const image = (notice.images || []).find((item) => String(item._id) === String(imageId));
  if (!image) {
    throw new NotFoundError('Notice photo not found');
  }
  notice.images = notice.images.filter((item) => String(item._id) !== String(imageId));
  notice.images.forEach((item, index) => {
    item.sortOrder = index;
  });
  await notice.save();
  const file = await StoredFile.findById(image.fileId);
  if (file) {
    file.availability = 'UNAVAILABLE';
    await file.save();
  }
  return mapNotice(notice);
}

export async function reorderNoticeImages(principal, noticeId, imageIds) {
  assertAdmin(principal);
  requireObjectId(noticeId, 'notice');
  const notice = await Notice.findOne({ _id: noticeId, departmentId: principal.departmentId });
  if (!notice) {
    throw new NotFoundError('Notice not found');
  }
  if (notice.publicationState === 'ARCHIVED') {
    throw new ValidationError('Photos cannot be changed after the notice is withdrawn');
  }
  const current = (notice.images || []).map((item) => String(item._id));
  const nextIds = Array.isArray(imageIds) ? imageIds.map(String) : [];
  if (nextIds.length !== current.length || nextIds.some((id) => !current.includes(id))) {
    throw new ValidationError('Photo order must include each current photo once');
  }
  const byId = new Map(notice.images.map((item) => [String(item._id), item]));
  notice.images = nextIds.map((id, index) => {
    const image = byId.get(id);
    image.sortOrder = index;
    return image;
  });
  await notice.save();
  return mapNotice(notice);
}

export async function updateNotice(principal, noticeId, body) {
  assertAdmin(principal);
  requireObjectId(noticeId, 'notice');
  const notice = await Notice.findOne({ _id: noticeId, departmentId: principal.departmentId });
  if (!notice) {
    throw new NotFoundError('Notice not found');
  }
  if (notice.publicationState === 'ARCHIVED') {
    throw new ValidationError('A withdrawn notice cannot be edited');
  }
  if (body.title) {
    notice.title = String(body.title).trim();
  }
  if (body.body) {
    notice.body = String(body.body).trim();
  }
  if (body.priority) {
    notice.priority = body.priority === 'HIGH' ? 'HIGH' : 'NORMAL';
  }
  await notice.save();
  await persistAudit({
    actorUserId: principal.userId,
    action: 'notice.update',
    entityType: 'Notice',
    entityId: String(notice._id),
    occurredAt: new Date(),
  });
  return mapNotice(notice);
}

export async function publishNotice(principal, noticeId, { infrastructure }) {
  assertAdmin(principal);
  requireObjectId(noticeId, 'notice');
  const notice = await Notice.findOne({ _id: noticeId, departmentId: principal.departmentId });
  if (!notice) {
    throw new NotFoundError('Notice not found');
  }
  notice.publicationState = 'PUBLISHED';
  notice.publishedAt = new Date();
  await notice.save();
  await persistAudit({
    actorUserId: principal.userId,
    action: 'notice.publish',
    entityType: 'Notice',
    entityId: String(notice._id),
    occurredAt: new Date(),
  });
  const recipientIds = await resolveNoticeRecipientIds(notice);
  for (const recipientUserId of recipientIds) {
    await fanoutNotification({
      recipientUserId,
      type: 'NOTICE_PUBLISHED',
      sourceModule: 'notices-calendar',
      sourceId: String(notice._id),
      departmentId: notice.departmentId,
      actionPath: `/notices/${notice._id}`,
      vars: { title: notice.title },
      infrastructure,
    });
  }
  return mapNotice(notice);
}

export async function archiveNotice(principal, noticeId) {
  assertAdmin(principal);
  requireObjectId(noticeId, 'notice');
  const notice = await Notice.findOne({ _id: noticeId, departmentId: principal.departmentId });
  if (!notice) {
    throw new NotFoundError('Notice not found');
  }
  notice.publicationState = 'ARCHIVED';
  notice.archivedAt = new Date();
  await notice.save();
  await persistAudit({
    actorUserId: principal.userId,
    action: 'notice.archive',
    entityType: 'Notice',
    entityId: String(notice._id),
    occurredAt: new Date(),
  });
  return mapNotice(notice);
}
