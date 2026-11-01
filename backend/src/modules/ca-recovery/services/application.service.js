import { CaApplication } from '../models/ca-application.model.js';
import { CaApplicationSubject } from '../models/ca-application-subject.model.js';
import { CaApplicationEvent } from '../models/ca-application-event.model.js';
import { CaSchedule } from '../models/ca-schedule.model.js';
import { IncompleteCa } from '../models/incomplete-ca.model.js';
import { CaApplicationWindow } from '../models/ca-application-window.model.js';
import {
  AcademicYear,
  Semester,
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
import { assertApplicationTransition } from './transitions.js';
import { JOB_NAMES } from '../../../infrastructure/queue/job-names.js';
import { isAtOrBeforeDeadline, parsePagination, requireObjectId, windowLifecycle } from '../utils/http.js';
import { emitCaNotification, recordCaAudit } from './notify.js';
import { notifyLecturersOfApproval } from './lecturer-notify.service.js';
import { syncApplicationStatusFromSubjects } from './application-status.service.js';
import { attachApprovedLinksToPublishedNotices } from './exam-notice.service.js';
import { resolveActiveOfferingForSubject } from './offering-resolver.js';
import QRCode from 'qrcode';
import { generateApplicationPdf } from './pdf.service.js';
import {
  composeExamForm,
  composeExamFormForApplication,
  hasSavedExamForm,
  normalizeExamForm,
  serializeExamForm,
} from './exam-form.service.js';

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
    physicallyVerifiedAt: doc.physicallyVerifiedAt || null,
    physicalInspection: doc.physicalInspection?.confirmedAt
      ? { confirmedAt: doc.physicalInspection.confirmedAt, method: doc.physicalInspection.method }
      : null,
    decisionReason: doc.decisionReason || '',
    reopenReason: doc.reopenReason || '',
    resubmissionCount: doc.resubmissionCount,
    subjects,
    form: serializeExamForm(doc.form),
  };
}

async function attendedConditionIds(conditionIds) {
  if (!conditionIds.length) {
    return new Set();
  }
  const links = await CaApplicationSubject.find({
    incompleteCaId: { $in: conditionIds },
    examStatus: 'COMPLETED',
  }).select('incompleteCaId');
  return new Set(links.map((link) => String(link.incompleteCaId)));
}

async function requireNotAttended(conditions) {
  const attended = await attendedConditionIds(conditions.map((item) => item._id));
  if (conditions.some((item) => attended.has(String(item._id)))) {
    throw new ValidationError('A subject whose CA you already attended cannot be applied for again');
  }
}

export async function listEligibleConditions(principal, query = {}) {
  assertStudent(principal);
  const context = await findStudentContextByUserId(principal.userId);
  if (!context) {
    return { items: [], window: null };
  }
  const explicitPeriod = Boolean(query.academicYearId && query.semesterId);
  const conditions = await IncompleteCa.find({
    studentUserId: principal.userId,
    ...(explicitPeriod
      ? { academicYearId: query.academicYearId, semesterId: query.semesterId }
      : {}),
    status: { $in: ['OPEN', 'IN_APPLICATION'] },
  }).sort({ subjectCode: 1 });
  const windows = await CaApplicationWindow.find({ departmentId: context.departmentId });
  const openWindowFor = (academicYearId, semesterId) =>
    windows.find(
      (item) =>
        String(item.academicYearId) === String(academicYearId) &&
        String(item.semesterId) === String(semesterId) &&
        windowLifecycle(item) === 'OPEN',
    );
  // A subject whose CA was attended is only waiting for the official result; it cannot be applied for again.
  const attended = await attendedConditionIds(conditions.map((item) => item._id));
  const items = conditions.filter(
    (item) => !attended.has(String(item._id)) && openWindowFor(item.academicYearId, item.semesterId),
  );
  const window = items.length ? openWindowFor(items[0].academicYearId, items[0].semesterId) : null;
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
          lifecycle: 'OPEN',
          opensAt: window.opensAt,
          closesAt: window.closesAt,
        }
      : null,
  };
}

export async function previewApplicationForm(principal, query = {}) {
  assertStudent(principal);
  const ids = String(query.incompleteCaIds || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!ids.length) {
    throw new ValidationError('Select at least one subject');
  }
  const context = await findStudentContextByUserId(principal.userId);
  if (!context) {
    throw new NotFoundError('Student academic context not found');
  }
  const conditions = [];
  for (const id of ids) {
    requireObjectId(id, 'incomplete CA');
    const condition = await IncompleteCa.findById(id);
    if (!condition || String(condition.studentUserId) !== String(principal.userId) || condition.status === 'RESOLVED') {
      throw new ForbiddenError('One or more subjects are not eligible');
    }
    conditions.push(condition);
  }
  await requireNotAttended(conditions);
  const academicYearId = String(conditions[0].academicYearId);
  const semesterId = String(conditions[0].semesterId);
  if (
    conditions.some(
      (item) => String(item.academicYearId) !== academicYearId || String(item.semesterId) !== semesterId,
    )
  ) {
    throw new ValidationError('Use a separate form for each year and semester of examination');
  }
  const form = await composeExamForm({
    userId: principal.userId,
    context,
    examYearId: academicYearId,
    examSemesterId: semesterId,
    subjectRefs: conditions.map((item) => ({ subjectId: item.subjectId, subjectCode: item.subjectCode })),
  });
  return { form, academicYearId, semesterId };
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
  const schedules = await CaSchedule.find({ _id: { $in: rows.map((row) => row.activeScheduleId).filter(Boolean) } });
  const scheduleById = new Map(schedules.map((item) => [String(item._id), item]));
  const subjects = await Subject.find({ _id: { $in: rows.map((row) => row.subjectId) } }).select('code name');
  const subjectById = new Map(subjects.map((item) => [String(item._id), item]));
  return rows.map((row) => {
    const schedule = row.activeScheduleId ? scheduleById.get(String(row.activeScheduleId)) : null;
    const subject = subjectById.get(String(row.subjectId));
    return {
      incompleteCaId: String(row.incompleteCaId),
      subjectId: String(row.subjectId),
      subjectOfferingId: row.subjectOfferingId ? String(row.subjectOfferingId) : null,
      subjectCode: subject?.code || '',
      subjectName: subject?.name || '',
      examStatus: row.examStatus,
      exam:
        schedule && schedule.status === 'ACTIVE'
          ? {
              scheduledAt: schedule.scheduledAt,
              endsAt: schedule.endsAt || null,
              venue: schedule.venue || '',
              generation: schedule.generation || 1,
            }
          : null,
    };
  });
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
  await requireNotAttended(conditions);

  const student = await User.findById(principal.userId);
  const composed = await composeExamForm({
    userId: principal.userId,
    context,
    examYearId: body.academicYearId,
    examSemesterId: body.semesterId,
    subjectRefs: conditions.map((item) => ({ subjectId: item.subjectId, subjectCode: item.subjectCode })),
  });
  const form = normalizeExamForm(body.form, composed);
  const [examYear, examSemester] = await Promise.all([
    AcademicYear.findById(body.academicYearId),
    Semester.findById(body.semesterId),
  ]);
  let applicationId = '';
  for (let copy = 1; copy <= 9; copy += 1) {
    const candidate = createPublicApplicationId({
      registrationNumber: context.registrationNumber,
      yearSequence: examYear?.sequence,
      semesterSequence: examSemester?.sequence,
      copy,
    });
    const taken = await CaApplication.exists({ applicationId: candidate });
    if (!taken) {
      applicationId = candidate;
      break;
    }
  }
  if (!applicationId) {
    applicationId = createPublicApplicationId();
  }
  let application;
  try {
    application = await CaApplication.create({
      applicationId,
      departmentId: context.departmentId,
      studentUserId: principal.userId,
      registrationNumber: context.registrationNumber,
      academicYearId: body.academicYearId,
      semesterId: body.semesterId,
      windowId: window._id,
      windowOpensAt: window.opensAt,
      windowClosesAt: window.closesAt,
      workflowStatus: 'DRAFT',
      form,
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ConflictError('An application already exists for this semester');
    }
    throw error;
  }

  for (const condition of conditions) {
    const offering = await resolveActiveOfferingForSubject({
      departmentId: context.departmentId,
      subjectId: condition.subjectId,
      preferBatchId: context.batchId,
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

export async function getApplication(principal, applicationId, { config } = {}) {
  if (principal.role === ROLES.LECTURER) {
    throw new ForbiddenError('Forbidden');
  }
  const doc = await loadOwnedApplication(principal, applicationId);
  const events = await CaApplicationEvent.find({ applicationId: doc._id }).sort({ occurredAt: 1 });
  const form = hasSavedExamForm(doc.form)
    ? serializeExamForm(doc.form)
    : serializeExamForm(await composeExamFormForApplication(doc));
  let qrDataUrl = '';
  if (doc.qrVerificationToken) {
    const publicUrl = config?.api?.publicUrl || 'http://localhost:3001';
    const verifyUrl = `${publicUrl}/api/ca/verify/${doc.qrVerificationToken}`;
    qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 180 });
  }
  return {
    ...mapApplication(doc, await subjectsFor(doc)),
    form,
    qrDataUrl,
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
  const returnedForCorrection = Boolean(doc.reopenedAt);
  if (!returnedForCorrection && !isAtOrBeforeDeadline(new Date(), doc.windowClosesAt)) {
    throw new ValidationError('The application deadline has passed');
  }
  if (body.form && typeof body.form === 'object') {
    const base = hasSavedExamForm(doc.form) ? serializeExamForm(doc.form) : await composeExamFormForApplication(doc);
    doc.form = normalizeExamForm(body.form, base);
    await doc.save();
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
    await requireNotAttended([condition]);
    const offering = await resolveActiveOfferingForSubject({
      departmentId: context.departmentId,
      subjectId: condition.subjectId,
      preferBatchId: context.batchId,
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
  const returnedForCorrection = Boolean(doc.reopenedAt);
  if (!returnedForCorrection && !isAtOrBeforeDeadline(now, doc.windowClosesAt)) {
    throw new ValidationError('The application deadline has passed');
  }
  if (!returnedForCorrection) {
    const window = await CaApplicationWindow.findById(doc.windowId);
    if (windowLifecycle(window, now) !== 'OPEN') {
      throw new ValidationError('The CA application window is not open');
    }
  }
  const subjects = await CaApplicationSubject.find({ applicationId: doc._id });
  if (!subjects.length) {
    throw new ValidationError('Select at least one eligible subject');
  }

  const fromStatus = doc.workflowStatus;
  assertApplicationTransition(fromStatus, 'SUBMITTED');
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
    departmentId: doc.departmentId,
    infrastructure,
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

function receiptToken(receipt) {
  const value = String(receipt || '').trim();
  const marker = '/api/ca/verify/';
  const index = value.indexOf(marker);
  if (index === -1) {
    return value;
  }
  const raw = value.slice(index + marker.length).split(/[?#/]/)[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function receiptMatches(doc, receipt) {
  const value = String(receipt || '').trim();
  if (!value) {
    return false;
  }
  if (value.toUpperCase() === String(doc.applicationId || '').toUpperCase()) {
    return true;
  }
  const token = doc.qrVerificationToken;
  return Boolean(token) && receiptToken(value) === token;
}

export async function confirmPhysicalReceipt(principal, applicationId, body = {}) {
  assertAdmin(principal);
  const doc = await loadOwnedApplication(principal, applicationId);
  if (!['SUBMITTED', 'UNDER_VERIFICATION'].includes(doc.workflowStatus) || doc.physicalVerificationStatus === 'PHYSICALLY_VERIFIED') {
    throw new ValidationError('This application is not waiting for a physical copy');
  }
  if (!receiptMatches(doc, body.receipt)) {
    throw new ValidationError('This form id does not match the application on screen');
  }
  return { matched: true, applicationId: doc.applicationId };
}

/** QR_SCAN when the scanned value is the verify URL/token, MANUAL_ID when the Application ID was typed. */
function inspectionMethod(doc, receipt) {
  return String(receipt || '').trim().toUpperCase() === String(doc.applicationId || '').toUpperCase()
    ? 'MANUAL_ID'
    : 'QR_SCAN';
}

/**
 * One-step physical verification from a QR scan or a typed Application ID.
 * The admin must explicitly confirm they inspected the printed form and the physical HOD signature.
 * This records PHYSICALLY_VERIFIED only; approval is a separate admin action.
 */
export async function scanVerify(principal, body = {}) {
  assertAdmin(principal);
  if (body.inspectionConfirmed !== true) {
    throw new ValidationError('Confirm that you inspected the printed form and the physical HOD signature');
  }
  const receipt = String(body.receipt || '').trim();
  if (!receipt) {
    throw new ValidationError('Scan the QR code or enter the Application ID');
  }
  const token = receiptToken(receipt);
  const doc = await CaApplication.findOne({
    departmentId: principal.departmentId,
    $or: [{ applicationId: receipt.toUpperCase() }, ...(token ? [{ qrVerificationToken: token }] : [])],
  });
  if (!doc) {
    throw new NotFoundError('Application not found');
  }
  if (doc.physicalVerificationStatus === 'PHYSICALLY_VERIFIED' && doc.workflowStatus !== 'REJECTED') {
    return { ...mapApplication(doc, await subjectsFor(doc)), alreadyVerified: true };
  }
  const verified = await verifyPhysical(principal, doc.applicationId, {
    outcome: 'verified',
    receipt,
    inspectionConfirmed: true,
  });
  return { ...verified, alreadyVerified: false };
}

export async function verifyPhysical(principal, applicationId, body) {
  assertAdmin(principal);
  const doc = await loadOwnedApplication(principal, applicationId);
  if (!['SUBMITTED', 'UNDER_VERIFICATION'].includes(doc.workflowStatus)) {
    throw new ValidationError('Application is not awaiting physical verification');
  }
  const outcome = String(body.outcome || 'verified');
  if (outcome !== 'failed' && !receiptMatches(doc, body.receipt)) {
    throw new ValidationError('Enter or scan the printed form for this application before marking it physically verified');
  }
  if (outcome !== 'failed' && body.inspectionConfirmed !== true) {
    throw new ValidationError('Confirm that you inspected the printed form and the physical HOD signature');
  }
  const fromStatus = doc.workflowStatus;
  if (outcome === 'failed') {
    assertApplicationTransition(fromStatus, 'REJECTED');
    doc.physicalVerificationStatus = 'VERIFICATION_FAILED';
    doc.workflowStatus = 'REJECTED';
    doc.decisionReason = String(body.reason || 'Physical verification failed');
    doc.decidedAt = new Date();
    doc.decidedByUserId = principal.userId;
  } else {
    const verifiedAt = new Date();
    doc.physicalVerificationStatus = 'PHYSICALLY_VERIFIED';
    doc.physicallyVerifiedAt = verifiedAt;
    doc.verifiedByAdminUserId = principal.userId;
    doc.physicalInspection = {
      confirmedByUserId: principal.userId,
      confirmedAt: verifiedAt,
      method: inspectionMethod(doc, body.receipt),
    };
    if (fromStatus !== 'UNDER_VERIFICATION') {
      assertApplicationTransition(fromStatus, 'UNDER_VERIFICATION');
    }
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
  await recordCaAudit({
    actorUserId: principal.userId,
    action: outcome === 'failed' ? 'ca.application.verify-failed' : 'ca.application.verify',
    entityType: 'CaApplication',
    entityId: doc._id,
    departmentId: doc.departmentId,
    metadata:
      outcome === 'failed'
        ? { applicationId: doc.applicationId, reason: doc.decisionReason }
        : {
            applicationId: doc.applicationId,
            method: doc.physicalInspection?.method,
            inspectionConfirmed: true,
          },
  });
  return mapApplication(doc, await subjectsFor(doc));
}

export async function approveApplication(principal, applicationId, { infrastructure } = {}) {
  assertAdmin(principal);
  const doc = await loadOwnedApplication(principal, applicationId);
  if (doc.workflowStatus !== 'UNDER_VERIFICATION' || doc.physicalVerificationStatus !== 'PHYSICALLY_VERIFIED') {
    throw new ValidationError('Physical verification is required before approval');
  }
  const fromStatus = doc.workflowStatus;
  assertApplicationTransition(fromStatus, 'APPROVED');
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
    departmentId: doc.departmentId,
    infrastructure,
  });
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'ca.application.approve',
    entityType: 'CaApplication',
    entityId: doc._id,
    metadata: { applicationId: doc.applicationId },
  });
  // Offerings may have changed (or never matched) since the draft; point each link at the running offering.
  const pending = await CaApplicationSubject.find({ applicationId: doc._id, examStatus: 'PENDING_APPROVAL' });
  for (const link of pending) {
    const offering = await resolveActiveOfferingForSubject({
      departmentId: doc.departmentId,
      subjectId: link.subjectId,
      preferBatchId: link.subjectOfferingId ? (await SubjectOffering.findById(link.subjectOfferingId))?.batchId : null,
    });
    if (offering && String(offering._id) !== String(link.subjectOfferingId)) {
      link.subjectOfferingId = offering._id;
      await link.save();
    }
  }
  // Each subject becomes schedulable on its own; the lecturers of those exact offerings are told.
  await CaApplicationSubject.updateMany(
    { applicationId: doc._id, examStatus: 'PENDING_APPROVAL' },
    { $set: { examStatus: 'READY_TO_SCHEDULE', statusChangedAt: new Date() } },
  );
  const links = await CaApplicationSubject.find({ applicationId: doc._id });
  await syncApplicationStatusFromSubjects(doc._id, { actorUserId: principal.userId, reason: 'Approved' });
  await notifyLecturersOfApproval({ application: doc, links, infrastructure });
  await attachApprovedLinksToPublishedNotices({ application: doc, links, infrastructure });
  return mapApplication(await CaApplication.findById(doc._id), await subjectsFor(doc));
}

export async function rejectApplication(principal, applicationId, body, { infrastructure } = {}) {
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
  assertApplicationTransition(fromStatus, 'REJECTED');
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
    departmentId: doc.departmentId,
    infrastructure,
  });
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'ca.application.reject',
    entityType: 'CaApplication',
    entityId: doc._id,
    departmentId: doc.departmentId,
    metadata: { applicationId: doc.applicationId, reason },
  });
  return mapApplication(doc, await subjectsFor(doc));
}

export async function reopenApplication(principal, applicationId, body, { infrastructure } = {}) {
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
  assertApplicationTransition(fromStatus, 'DRAFT');
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
    sourceId: `${doc.applicationId}:${doc.resubmissionCount}`,
    departmentId: doc.departmentId,
    infrastructure,
    vars: {
      applicationId: doc.applicationId,
      reason,
      bodyTemplate:
        '{{applicationId}} was sent back so you can check and correct the form, then submit it again. Reason: {{reason}}',
    },
  });
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'ca.application.reopen',
    entityType: 'CaApplication',
    entityId: doc._id,
    departmentId: doc.departmentId,
    metadata: { applicationId: doc.applicationId, reason },
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

