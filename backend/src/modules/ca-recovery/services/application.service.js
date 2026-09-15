import { CaApplication } from '../models/ca-application.model.js';
import { CaApplicationSubject } from '../models/ca-application-subject.model.js';
import { CaApplicationEvent } from '../models/ca-application-event.model.js';
import { IncompleteCa } from '../models/incomplete-ca.model.js';
import { CaApplicationWindow } from '../models/ca-application-window.model.js';
import {
  findStudentContextByUserId,
  Subject,
  SubjectOffering,
} from '../../academic-foundation/index.js';
import { User } from '../../authentication/models/user.model.js';
import { ROLES } from '../../../shared/constants/roles.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/app-error.js';
import { createPublicApplicationId, createQrVerificationToken } from '../public-ids.js';
import { JOB_NAMES } from '../../../infrastructure/queue/job-names.js';
import { isAtOrBeforeDeadline, parsePagination, requireObjectId, windowLifecycle } from '../utils/http.js';
import { emitCaNotification, recordCaAudit } from './notify.js';
import { generateApplicationPdf } from './pdf.service.js';

function assertStudent(principal) {
  if (!principal || principal.role !== ROLES.STUDENT) {
    throw new ForbiddenError('Forbidden');
  }
}

function assertAdmin(principal) {
  if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR || !principal.departmentId) {
    throw new ForbiddenError('Forbidden');
  }
}

async function recordEvent({ application, type, actorUserId, fromStatus, toStatus, reason = '' }) {
  await CaApplicationEvent.create({
    applicationId: application._id,
    type,
    actorUserId,
    fromStatus,
    toStatus,
    reason,
    occurredAt: new Date(),
  });
}

export function mapApplication(doc, subjects = []) {
  return {
    id: String(doc._id),
    applicationId: doc.applicationId,
    workflowStatus: doc.workflowStatus,
    physicalVerificationStatus: doc.physicalVerificationStatus,
    pdfStatus: doc.pdfStatus,
    pdfTemplateVersion: doc.pdfTemplateVersion || null,
    academicYearId: String(doc.academicYearId),
    semesterId: String(doc.semesterId),
    registrationNumber: doc.registrationNumber,
    windowOpensAt: doc.windowOpensAt,
    windowClosesAt: doc.windowClosesAt,
    submittedAt: doc.submittedAt || null,
    decisionReason: doc.decisionReason || '',
    reopenReason: doc.reopenReason || '',
    resubmissionCount: doc.resubmissionCount,
    subjects,
  };
}

export async function listEligibleConditions(principal, query = {}) {
  assertStudent(principal);
  const context = await findStudentContextByUserId(principal.userId);
  if (!context) {
    return { items: [], window: null };
  }
  const academicYearId = query.academicYearId || context.currentAcademicYearId;
  const semesterId = query.semesterId || context.currentSemesterId;
  const items = await IncompleteCa.find({
    studentUserId: principal.userId,
    academicYearId,
    semesterId,
    status: { $in: ['OPEN', 'IN_APPLICATION'] },
  }).sort({ subjectCode: 1 });
  const window = await CaApplicationWindow.findOne({
    departmentId: context.departmentId,
    academicYearId,
    semesterId,
  });
  return {
    items: items.map((item) => ({
      id: String(item._id),
      subjectCode: item.subjectCode,
      subjectId: String(item.subjectId),
      status: item.status,
      academicYearId: String(item.academicYearId),
      semesterId: String(item.semesterId),
    })),
    window: window
      ? {
          id: String(window._id),
          lifecycle: windowLifecycle(window),
          opensAt: window.opensAt,
          closesAt: window.closesAt,
        }
      : null,
  };
}

async function loadOwnedApplication(principal, applicationId) {
  const doc = await CaApplication.findOne({ applicationId });
  if (!doc) {
    throw new NotFoundError('Application not found');
  }
  if (principal.role === ROLES.STUDENT && String(doc.studentUserId) !== String(principal.userId)) {
    throw new NotFoundError('Application not found');
  }
  if (
    principal.role === ROLES.DEPARTMENT_ADMINISTRATOR &&
    String(doc.departmentId) !== String(principal.departmentId)
  ) {
    throw new NotFoundError('Application not found');
  }
  return doc;
}

async function subjectsFor(application) {
  const rows = await CaApplicationSubject.find({ applicationId: application._id });
  return rows.map((row) => ({
    incompleteCaId: String(row.incompleteCaId),
    subjectId: String(row.subjectId),
    subjectOfferingId: row.subjectOfferingId ? String(row.subjectOfferingId) : null,
  }));
}

export async function createDraft(principal, body) {
  assertStudent(principal);
  const context = await findStudentContextByUserId(principal.userId);
  if (!context) {
    throw new ValidationError('Academic membership is required');
  }
  requireObjectId(body.academicYearId, 'academic year');
  requireObjectId(body.semesterId, 'semester');
  const ids = Array.isArray(body.incompleteCaIds) ? body.incompleteCaIds : [];
  if (!ids.length) {
    throw new ValidationError('Select at least one eligible subject');
  }

  const window = await CaApplicationWindow.findOne({
    departmentId: context.departmentId,
    academicYearId: body.academicYearId,
    semesterId: body.semesterId,
  });
  if (windowLifecycle(window) !== 'OPEN') {
    throw new ValidationError('The CA application window is not open');
  }

  const conditions = [];
  for (const id of ids) {
    requireObjectId(id, 'incomplete CA');
    const condition = await IncompleteCa.findById(id);
    if (
      !condition ||
      String(condition.studentUserId) !== String(principal.userId) ||
      String(condition.academicYearId) !== String(body.academicYearId) ||
      String(condition.semesterId) !== String(body.semesterId) ||
      condition.status === 'RESOLVED'
    ) {
      throw new ForbiddenError('One or more subjects are not eligible');
    }
    conditions.push(condition);
  }

  const student = await User.findById(principal.userId);
  let application;
  try {
    application = await CaApplication.create({
      applicationId: createPublicApplicationId(),
      departmentId: context.departmentId,
      studentUserId: principal.userId,
      registrationNumber: context.registrationNumber,
      academicYearId: body.academicYearId,
      semesterId: body.semesterId,
      windowId: window._id,
      windowOpensAt: window.opensAt,
      windowClosesAt: window.closesAt,
      workflowStatus: 'DRAFT',
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ConflictError('An application already exists for this semester');
    }
    throw error;
  }

  for (const condition of conditions) {
    const offering = await SubjectOffering.findOne({
      departmentId: context.departmentId,
      subjectId: condition.subjectId,
      batchId: context.batchId,
      academicYearId: condition.academicYearId,
      semesterId: condition.semesterId,
    });
    await CaApplicationSubject.create({
      applicationId: application._id,
      incompleteCaId: condition._id,
      subjectId: condition.subjectId,
      subjectOfferingId: offering?._id,
    });
    if (condition.status === 'OPEN') {
      condition.status = 'IN_APPLICATION';
      await condition.save();
    }
  }

  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'ca.application.create',
    entityType: 'CaApplication',
    entityId: application._id,
    metadata: { applicationId: application.applicationId, displayName: student?.displayName },
  });
  return mapApplication(application, await subjectsFor(application));
}

export async function listOwnApplications(principal) {
  assertStudent(principal);
  const items = await CaApplication.find({ studentUserId: principal.userId }).sort({ createdAt: -1 });
  const mapped = [];
  for (const item of items) {
    mapped.push(mapApplication(item, await subjectsFor(item)));
  }
  return { items: mapped };
}

export async function getApplication(principal, applicationId) {
  if (principal.role === ROLES.LECTURER) {
    throw new ForbiddenError('Forbidden');
  }
  const doc = await loadOwnedApplication(principal, applicationId);
  const events = await CaApplicationEvent.find({ applicationId: doc._id }).sort({ occurredAt: 1 });
  return {
    ...mapApplication(doc, await subjectsFor(doc)),
    timeline: events.map((item) => ({
      type: item.type,
      fromStatus: item.fromStatus,
      toStatus: item.toStatus,
      occurredAt: item.occurredAt,
      reason: item.reason || '',
    })),
  };
}

export async function updateDraft(principal, applicationId, body) {
  assertStudent(principal);
  const doc = await loadOwnedApplication(principal, applicationId);
  if (doc.workflowStatus !== 'DRAFT') {
    throw new ValidationError('Only draft applications can be edited');
  }
  if (!isAtOrBeforeDeadline(new Date(), doc.windowClosesAt)) {
    throw new ValidationError('The application deadline has passed');
  }
  if (body.workflowStatus || body.studentUserId || body.registrationNumber) {
    throw new ForbiddenError('Forbidden');
  }
  if (!Array.isArray(body.incompleteCaIds) || !body.incompleteCaIds.length) {
    return mapApplication(doc, await subjectsFor(doc));
  }
  const previous = await CaApplicationSubject.find({ applicationId: doc._id });
  for (const row of previous) {
    const condition = await IncompleteCa.findById(row.incompleteCaId);
    if (condition && condition.status === 'IN_APPLICATION') {
      condition.status = 'OPEN';
      await condition.save();
    }
  }
  await CaApplicationSubject.deleteMany({ applicationId: doc._id });
  const context = await findStudentContextByUserId(principal.userId);
  for (const id of body.incompleteCaIds) {
    requireObjectId(id, 'incomplete CA');
    const condition = await IncompleteCa.findById(id);
    if (
      !condition ||
      String(condition.studentUserId) !== String(principal.userId) ||
      String(condition.academicYearId) !== String(doc.academicYearId) ||
      String(condition.semesterId) !== String(doc.semesterId) ||
      condition.status === 'RESOLVED'
    ) {
      throw new ForbiddenError('One or more subjects are not eligible');
    }
    const offering = await SubjectOffering.findOne({
      departmentId: context.departmentId,
      subjectId: condition.subjectId,
      batchId: context.batchId,
      academicYearId: condition.academicYearId,
      semesterId: condition.semesterId,
    });
    await CaApplicationSubject.create({
      applicationId: doc._id,
      incompleteCaId: condition._id,
      subjectId: condition.subjectId,
      subjectOfferingId: offering?._id,
    });
    if (condition.status === 'OPEN') {
      condition.status = 'IN_APPLICATION';
      await condition.save();
    }
  }
  return mapApplication(doc, await subjectsFor(doc));
}

export async function submitApplication(principal, applicationId, { config, infrastructure }) {
  assertStudent(principal);
  const doc = await loadOwnedApplication(principal, applicationId);
  if (doc.workflowStatus !== 'DRAFT') {
    throw new ValidationError('Only a draft application can be submitted');
  }
  const now = new Date();
  if (!isAtOrBeforeDeadline(now, doc.windowClosesAt)) {
    throw new ValidationError('The application deadline has passed');
  }
  const window = await CaApplicationWindow.findById(doc.windowId);
  if (windowLifecycle(window, now) !== 'OPEN') {
    throw new ValidationError('The CA application window is not open');
  }
  const subjects = await CaApplicationSubject.find({ applicationId: doc._id });
  if (!subjects.length) {
    throw new ValidationError('Select at least one eligible subject');
  }

  const fromStatus = doc.workflowStatus;
  doc.workflowStatus = 'SUBMITTED';
  doc.physicalVerificationStatus = 'AWAITING_PHYSICAL';
  doc.submittedAt = now;
  doc.pdfStatus = 'PENDING';
  doc.qrVerificationToken = doc.qrVerificationToken || createQrVerificationToken();
  await doc.save();
  await recordEvent({
    application: doc,
    type: 'SUBMITTED',
    actorUserId: principal.userId,
    fromStatus,
    toStatus: 'SUBMITTED',
  });
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'ca.application.submit',
    entityType: 'CaApplication',
    entityId: doc._id,
    metadata: { applicationId: doc.applicationId },
  });
  await emitCaNotification({
    recipientUserId: principal.userId,
    type: 'CA_APPLICATION_SUBMITTED',
    sourceId: doc.applicationId,
  });
  if (infrastructure.queue?.enqueue) {
    await infrastructure.queue.enqueue({
      name: JOB_NAMES.CA_PDF_GENERATE,
      payload: { applicationId: doc.applicationId },
      jobId: `ca.pdf:${doc.applicationId}:${doc.resubmissionCount}`,
    });
  }
  await generateApplicationPdf({ applicationId: doc.applicationId, config, infrastructure });
  return mapApplication(await CaApplication.findById(doc._id), await subjectsFor(doc));
}

export async function adminListApplications(principal, query = {}) {
  assertAdmin(principal);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { departmentId: principal.departmentId };
  if (query.workflowStatus) {
    filter.workflowStatus = String(query.workflowStatus);
  }
  if (query.applicationId) {
    filter.applicationId = String(query.applicationId).trim();
  }
  if (query.registrationNumber) {
    filter.registrationNumber = String(query.registrationNumber).trim().toUpperCase();
  }
  if (query.academicYearId) {
    requireObjectId(query.academicYearId, 'academic year');
    filter.academicYearId = query.academicYearId;
  }
  if (query.semesterId) {
    requireObjectId(query.semesterId, 'semester');
    filter.semesterId = query.semesterId;
  }
  const [items, total] = await Promise.all([
    CaApplication.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    CaApplication.countDocuments(filter),
  ]);
  return { items: items.map((item) => mapApplication(item)), total, page, pageSize };
}

export async function verifyPhysical(principal, applicationId, body) {
  assertAdmin(principal);
  const doc = await loadOwnedApplication(principal, applicationId);
  if (!['SUBMITTED', 'UNDER_VERIFICATION'].includes(doc.workflowStatus)) {
    throw new ValidationError('Application is not awaiting physical verification');
  }
  const outcome = String(body.outcome || 'verified');
  const fromStatus = doc.workflowStatus;
  if (outcome === 'failed') {
    doc.physicalVerificationStatus = 'VERIFICATION_FAILED';
    doc.workflowStatus = 'REJECTED';
    doc.decisionReason = String(body.reason || 'Physical verification failed');
    doc.decidedAt = new Date();
    doc.decidedByUserId = principal.userId;
  } else {
    doc.physicalVerificationStatus = 'PHYSICALLY_VERIFIED';
    doc.physicallyVerifiedAt = new Date();
    doc.verifiedByAdminUserId = principal.userId;
    doc.workflowStatus = 'UNDER_VERIFICATION';
  }
  await doc.save();
  await recordEvent({
    application: doc,
    type: outcome === 'failed' ? 'REJECTED' : 'VERIFIED',
    actorUserId: principal.userId,
    fromStatus,
    toStatus: doc.workflowStatus,
    reason: doc.decisionReason,
  });
  return mapApplication(doc, await subjectsFor(doc));
}

export async function approveApplication(principal, applicationId) {
  assertAdmin(principal);
  const doc = await loadOwnedApplication(principal, applicationId);
  if (doc.workflowStatus !== 'UNDER_VERIFICATION' || doc.physicalVerificationStatus !== 'PHYSICALLY_VERIFIED') {
    throw new ValidationError('Physical verification is required before approval');
  }
  const fromStatus = doc.workflowStatus;
  doc.workflowStatus = 'APPROVED';
  doc.decidedAt = new Date();
  doc.decidedByUserId = principal.userId;
  await doc.save();
  await recordEvent({
    application: doc,
    type: 'APPROVED',
    actorUserId: principal.userId,
    fromStatus,
    toStatus: 'APPROVED',
  });
  await emitCaNotification({
    recipientUserId: doc.studentUserId,
    type: 'CA_APPLICATION_APPROVED',
    sourceId: doc.applicationId,
  });
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'ca.application.approve',
    entityType: 'CaApplication',
    entityId: doc._id,
    metadata: { applicationId: doc.applicationId },
  });
  return mapApplication(doc, await subjectsFor(doc));
}

export async function rejectApplication(principal, applicationId, body) {
  assertAdmin(principal);
  const doc = await loadOwnedApplication(principal, applicationId);
  if (!['SUBMITTED', 'UNDER_VERIFICATION', 'DRAFT'].includes(doc.workflowStatus)) {
    throw new ValidationError('Application cannot be rejected in its current state');
  }
  const reason = String(body.reason || '').trim();
  if (!reason) {
    throw new ValidationError('A rejection reason is required');
  }
  const fromStatus = doc.workflowStatus;
  doc.workflowStatus = 'REJECTED';
  doc.decisionReason = reason;
  doc.decidedAt = new Date();
  doc.decidedByUserId = principal.userId;
  await doc.save();
  await recordEvent({
    application: doc,
    type: 'REJECTED',
    actorUserId: principal.userId,
    fromStatus,
    toStatus: 'REJECTED',
    reason,
  });
  await emitCaNotification({
    recipientUserId: doc.studentUserId,
    type: 'CA_APPLICATION_REJECTED',
    sourceId: doc.applicationId,
  });
  return mapApplication(doc, await subjectsFor(doc));
}

export async function reopenApplication(principal, applicationId, body) {
  assertAdmin(principal);
  const doc = await loadOwnedApplication(principal, applicationId);
  if (!['REJECTED', 'SUBMITTED'].includes(doc.workflowStatus)) {
    throw new ValidationError('Only rejected or submitted applications can be reopened');
  }
  const reason = String(body.reason || '').trim();
  if (!reason) {
    throw new ValidationError('A reopen reason is required');
  }
  const fromStatus = doc.workflowStatus;
  doc.workflowStatus = 'DRAFT';
  doc.physicalVerificationStatus = 'NOT_STARTED';
  doc.reopenReason = reason;
  doc.reopenedAt = new Date();
  doc.reopenedByUserId = principal.userId;
  doc.resubmissionCount += 1;
  doc.pdfStatus = 'PENDING';
  await doc.save();
  await recordEvent({
    application: doc,
    type: 'REOPENED',
    actorUserId: principal.userId,
    fromStatus,
    toStatus: 'DRAFT',
    reason,
  });
  await emitCaNotification({
    recipientUserId: doc.studentUserId,
    type: 'CA_APPLICATION_REOPENED',
    sourceId: doc.applicationId,
  });
  return mapApplication(doc, await subjectsFor(doc));
}

export async function verifyByToken(token) {
  const value = String(token || '').trim();
  if (!value) {
    throw new NotFoundError('Application not found');
  }
  const doc = await CaApplication.findOne({ qrVerificationToken: value });
  if (!doc) {
    throw new NotFoundError('Application not found');
  }
  return {
    authentic: true,
    applicationId: doc.applicationId,
    workflowStatus: doc.workflowStatus,
    physicalVerificationStatus: doc.physicalVerificationStatus,
  };
}

