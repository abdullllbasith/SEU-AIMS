import { Notice } from '../models/notice.model.js';
import { noticeVisibleToPrincipal, resolveNoticeRecipientIds } from './audience.service.js';
import {
  findStudentContextByUserId,
  SubjectOffering,
} from '../../academic-foundation/index.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { fanoutNotification } from '../../notifications/index.js';
import { recordAudit as persistAudit } from '../../audit-security/services/record-audit.service.js';
import { parsePagination, requireObjectId } from '../../notifications/utils/http.js';

function assertAdmin(principal) {
  if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR || !principal.departmentId) {
    throw new ForbiddenError('Forbidden');
  }
}

function mapNotice(doc) {
  return {
    id: String(doc._id),
    title: doc.title,
    body: doc.body,
    publicationState: doc.publicationState,
    priority: doc.priority,
    publishedAt: doc.publishedAt || null,
    expiresAt: doc.expiresAt || null,
    targeting: doc.targeting,
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

export async function updateNotice(principal, noticeId, body) {
  assertAdmin(principal);
  requireObjectId(noticeId, 'notice');
  const notice = await Notice.findOne({ _id: noticeId, departmentId: principal.departmentId });
  if (!notice) {
    throw new NotFoundError('Notice not found');
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
