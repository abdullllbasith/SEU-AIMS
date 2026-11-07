import mongoose from 'mongoose';
import { CaApplication } from '../models/ca-application.model.js';
import { CaApplicationSubject } from '../models/ca-application-subject.model.js';
import { CaApplicationEvent } from '../models/ca-application-event.model.js';
import { CaExamNotice } from '../models/ca-exam-notice.model.js';
import { CaSchedule } from '../models/ca-schedule.model.js';
import { IncompleteCa } from '../models/incomplete-ca.model.js';
import { CalendarEvent } from '../../notices-calendar/index.js';
import { Notification } from '../../notifications/index.js';
import {
  Subject,
  SubjectOffering,
  findActiveAssignmentsForLecturer,
  findAssignment,
} from '../../academic-foundation/index.js';
import { User } from '../../authentication/models/user.model.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { COLOMBO_TIMEZONE, colomboLocalToUtc, formatColombo } from '../../../shared/time/colombo.js';
import { requireObjectId } from '../utils/http.js';
import { emitCaNotification, recordCaAudit } from './notify.js';
import { buildCaMessage } from './exam-messages.js';
import { notifyBatchStudents, wasNotifiedAsBatch } from './batch-notify.service.js';
import { syncApplicationStatusFromSubjects } from './application-status.service.js';
import { cancelNotificationsFor, guardRefFor, noticeSourceId, queueRemindersForLinks } from './reminder.service.js';

const SCHEDULABLE_APPLICATION_STATUSES = ['APPROVED', 'SCHEDULED'];

function assertLecturer(principal) {
  if (!principal || principal.role !== ROLES.LECTURER) {
    throw new ForbiddenError('Forbidden');
  }
}

/**
 * The lecturer must have an active assignment on this exact offering, be a verified lecturer,
 * and the offering must be ACTIVE and in the lecturer's department.
 */
export async function requireManagedOffering(principal, subjectOfferingId) {
  assertLecturer(principal);
  requireObjectId(subjectOfferingId, 'subject offering');
  const [assignment, offering, lecturer] = await Promise.all([
    findAssignment(principal.userId, subjectOfferingId),
    SubjectOffering.findById(subjectOfferingId),
    User.findById(principal.userId).select('lecturerStatus accountStatus'),
  ]);
  const sameDepartment =
    !principal.departmentId || !offering || String(offering.departmentId) === String(principal.departmentId);
  if (
    !assignment ||
    !offering ||
    offering.status !== 'ACTIVE' ||
    !sameDepartment ||
    lecturer?.lecturerStatus !== 'VERIFIED'
  ) {
    throw new ForbiddenError('Forbidden');
  }
  return { offering, assignment };
}

function parseWhen(body, fallback = {}) {
  let startsAt;
  let endsAt;
  if (body.scheduledAt) {
    startsAt = new Date(body.scheduledAt);
    endsAt = body.endsAt ? new Date(body.endsAt) : undefined;
  } else if (body.date || body.startTime) {
    startsAt = colomboLocalToUtc(body.date, body.startTime);
    endsAt = body.endTime ? colomboLocalToUtc(body.date, body.endTime) : undefined;
    if (body.endTime && !endsAt) {
      throw new ValidationError('A valid end time is required');
    }
  } else {
    startsAt = fallback.scheduledAt;
    endsAt = fallback.endsAt;
  }
  if (!startsAt || Number.isNaN(new Date(startsAt).getTime())) {
    throw new ValidationError('A valid examination date and start time are required');
  }
  if (endsAt && (Number.isNaN(new Date(endsAt).getTime()) || new Date(endsAt) <= new Date(startsAt))) {
    throw new ValidationError('The end time must be after the start time');
  }
  return { startsAt: new Date(startsAt), endsAt: endsAt ? new Date(endsAt) : undefined };
}

function requireFutureStart(startsAt, now = new Date()) {
  if (startsAt.getTime() <= now.getTime()) {
    throw new ValidationError('The examination must be scheduled for a future date and time');
  }
}

function requireVenue(value) {
  const venue = String(value || '').trim();
  if (!venue) {
    throw new ValidationError('A venue is required');
  }
  if (venue.length > 200) {
    throw new ValidationError('The venue is too long');
  }
  return venue;
}

async function eligibleLinks(offering, onlyLinkIds) {
  const filter = { subjectOfferingId: offering._id, examStatus: 'READY_TO_SCHEDULE' };
  if (onlyLinkIds?.length) {
    filter._id = { $in: onlyLinkIds };
  }
  const links = await CaApplicationSubject.find(filter);
  if (!links.length) {
    return [];
  }
  const applications = await CaApplication.find({
    _id: { $in: links.map((link) => link.applicationId) },
    departmentId: offering.departmentId,
    workflowStatus: { $in: SCHEDULABLE_APPLICATION_STATUSES },
  });
  const byId = new Map(applications.map((application) => [String(application._id), application]));
  return links
    .filter((link) => byId.has(String(link.applicationId)))
    .map((link) => ({ link, application: byId.get(String(link.applicationId)) }));
}

/** Timeline entry for one subject; toStatus is the application's status after it was re-derived. */
async function recordLinkEvent({ application, type, actorUserId, fromStatus, subject, reason = '' }) {
  const current = await CaApplication.findById(application._id).select('workflowStatus');
  await CaApplicationEvent.create({
    applicationId: application._id,
    type,
    actorUserId,
    fromStatus,
    toStatus: current?.workflowStatus || fromStatus,
    reason: reason || (subject ? `Subject ${subject.code}` : ''),
    occurredAt: new Date(),
  });
}

/**
 * Attach approved student subjects to a published notice: one ACTIVE CaSchedule per link, the link moves
 * READY_TO_SCHEDULE -> SCHEDULED, the application status is re-derived, and only these students are notified.
 */
async function attachLinks({ notice, entries, subject, actorUserId, infrastructure, type = 'CA_EXAM_SCHEDULED' }) {
  const attached = [];
  for (const { link, application } of entries) {
    const scheduleId = new mongoose.Types.ObjectId();
    let schedule;
    try {
      schedule = await CaSchedule.create({
        _id: scheduleId,
        departmentId: notice.departmentId,
        applicationId: application._id,
        incompleteCaId: link.incompleteCaId,
        subjectOfferingId: notice.subjectOfferingId,
        lecturerUserId: notice.lecturerUserId,
        calendarEventId: notice.calendarEventId,
        examNoticeId: notice._id,
        generation: notice.generation,
        status: 'ACTIVE',
        scheduledAt: notice.scheduledAt,
        endsAt: notice.endsAt,
        venue: notice.venue,
      });
    } catch (error) {
      if (error?.code === 11000) {
        continue;
      }
      throw error;
    }
    const claimed = await CaApplicationSubject.findOneAndUpdate(
      { _id: link._id, examStatus: 'READY_TO_SCHEDULE' },
      { $set: { examStatus: 'SCHEDULED', activeScheduleId: schedule._id, statusChangedAt: new Date() } },
      { new: true },
    );
    if (!claimed) {
      await CaSchedule.deleteOne({ _id: schedule._id });
      continue;
    }
    const fromStatus = application.workflowStatus;
    await syncApplicationStatusFromSubjects(application._id, { actorUserId, linkId: String(link._id) });
    await recordLinkEvent({ application, type: 'SCHEDULED', actorUserId, fromStatus, subject });
    // A current-batch student already has this notice and its reminders; do not send them twice.
    const batchNotified = await wasNotifiedAsBatch(notice, application.studentUserId);
    if (!batchNotified) {
      const { vars, templateParams } = buildCaMessage({ type, subject, notice, application });
      await emitCaNotification({
        recipientUserId: application.studentUserId,
        type,
        sourceId: noticeSourceId(notice, link),
        departmentId: application.departmentId,
        infrastructure,
        vars,
        templateParams,
        guardRef: guardRefFor(notice, link),
      });
    }
    attached.push({ link: claimed, application, subject, batchNotified });
  }
  const remindable = attached.filter((entry) => !entry.batchNotified);
  if (remindable.length) {
    await queueRemindersForLinks({ notice, entries: remindable, infrastructure });
  }
  return attached;
}

export async function publishExamNotice(principal, body, { infrastructure } = {}) {
  const { offering } = await requireManagedOffering(principal, body.subjectOfferingId);
  const { startsAt, endsAt } = parseWhen(body);
  requireFutureStart(startsAt);
  const venue = requireVenue(body.venue);
  const subject = await Subject.findById(offering.subjectId);
  if (!subject) {
    throw new NotFoundError('Subject not found');
  }
  if (await CaExamNotice.exists({ subjectOfferingId: offering._id, status: 'PUBLISHED' })) {
    throw new ConflictError('An examination notice is already published for this subject. Reschedule or cancel it.');
  }
  const onlyLinkIds = Array.isArray(body.linkIds) && body.linkIds.length ? body.linkIds : undefined;
  const entries = await eligibleLinks(offering, onlyLinkIds);
  if (!entries.length) {
    throw new ValidationError('No approved students are waiting for this subject');
  }

  const noticeId = new mongoose.Types.ObjectId();
  const calendar = await CalendarEvent.create({
    title: `CA examination: ${subject.code} ${subject.name}`,
    details: venue,
    startsAt,
    endsAt,
    timezone: COLOMBO_TIMEZONE,
    createdByUserId: principal.userId,
    departmentId: offering.departmentId,
    eventType: 'CA_SCHEDULE',
    publicationState: 'PUBLISHED',
    academicYearId: offering.academicYearId,
    semesterId: offering.semesterId,
    subjectOfferingId: offering._id,
    sourceModule: 'ca-recovery',
    sourceEntityId: String(noticeId),
    // CA reminders are owned by CA Recovery; the generic calendar reminders would duplicate them.
    reminderEnabled: false,
  });
  let notice;
  try {
    notice = await CaExamNotice.create({
      _id: noticeId,
      departmentId: offering.departmentId,
      subjectOfferingId: offering._id,
      subjectId: subject._id,
      lecturerUserId: principal.userId,
      calendarEventId: calendar._id,
      scheduledAt: startsAt,
      endsAt,
      venue,
      timezone: COLOMBO_TIMEZONE,
      status: 'PUBLISHED',
      generation: 1,
      history: [
        { generation: 1, action: 'PUBLISHED', scheduledAt: startsAt, endsAt, venue, actorUserId: principal.userId },
      ],
    });
  } catch (error) {
    await CalendarEvent.deleteOne({ _id: calendar._id });
    if (error?.code === 11000) {
      throw new ConflictError('An examination notice is already published for this subject');
    }
    throw error;
  }

  const attached = await attachLinks({
    notice,
    entries,
    subject,
    actorUserId: principal.userId,
    infrastructure,
  });
  const batchStudents = await notifyBatchStudents({
    type: 'CA_EXAM_SCHEDULED',
    notice,
    subject,
    offering,
    excludeUserIds: attached.map((item) => item.application.studentUserId),
    withReminders: true,
    infrastructure,
  });
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'ca.exam-notice.publish',
    entityType: 'CaExamNotice',
    entityId: notice._id,
    departmentId: notice.departmentId,
    metadata: { subjectOfferingId: String(offering._id), students: attached.length, batchStudents },
  });
  return mapNotice(notice, { subject, studentCount: attached.length });
}

/** Attach every currently eligible approved student of the offering to the PUBLISHED notice. */
export async function attachEligibleToNotice(principal, noticeId, { infrastructure } = {}) {
  requireObjectId(noticeId, 'exam notice');
  const notice = await CaExamNotice.findById(noticeId);
  if (!notice) {
    throw new NotFoundError('Exam notice not found');
  }
  const { offering } = await requireManagedOffering(principal, notice.subjectOfferingId);
  if (notice.status !== 'PUBLISHED') {
    throw new ValidationError('This examination notice is cancelled');
  }
  const subject = await Subject.findById(notice.subjectId);
  const attached = await attachLinks({
    notice,
    entries: await eligibleLinks(offering),
    subject,
    actorUserId: principal.userId,
    infrastructure,
  });
  return mapNotice(notice, { subject, studentCount: await activeStudentCount(notice._id), attached: attached.length });
}

/** Attach specific eligible subject links (by id) to an already published notice (legacy endpoint path). */
export async function attachLinksToExistingNotice(principal, notice, linkIds, { infrastructure } = {}) {
  const { offering } = await requireManagedOffering(principal, notice.subjectOfferingId);
  if (notice.status !== 'PUBLISHED') {
    throw new ValidationError('This examination notice is cancelled');
  }
  const entries = await eligibleLinks(offering, linkIds);
  if (!entries.length) {
    throw new ValidationError('No approved students are waiting for this subject');
  }
  const subject = await Subject.findById(notice.subjectId);
  return attachLinks({ notice, entries, subject, actorUserId: principal.userId, infrastructure });
}

/**
 * Called when an application is approved: students whose subject already has a PUBLISHED notice
 * join it automatically and receive that notice and its reminders.
 */
export async function attachApprovedLinksToPublishedNotices({ application, links, infrastructure }) {
  for (const link of links) {
    if (!link.subjectOfferingId) {
      continue;
    }
    const notice = await CaExamNotice.findOne({ subjectOfferingId: link.subjectOfferingId, status: 'PUBLISHED' });
    if (!notice || notice.scheduledAt.getTime() <= Date.now()) {
      continue;
    }
    const fresh = await CaApplicationSubject.findById(link._id);
    if (fresh?.examStatus !== 'READY_TO_SCHEDULE') {
      continue;
    }
    const subject = await Subject.findById(notice.subjectId);
    await attachLinks({
      notice,
      entries: [{ link: fresh, application }],
      subject,
      actorUserId: notice.lecturerUserId,
      infrastructure,
    });
  }
}

export async function rescheduleExamNotice(principal, noticeId, body = {}, { infrastructure } = {}) {
  requireObjectId(noticeId, 'exam notice');
  const current = await CaExamNotice.findById(noticeId);
  if (!current) {
    throw new NotFoundError('Exam notice not found');
  }
  await requireManagedOffering(principal, current.subjectOfferingId);
  if (current.status !== 'PUBLISHED') {
    throw new ValidationError('A cancelled examination notice cannot be rescheduled. Publish a new notice.');
  }
  const { startsAt, endsAt } = parseWhen(body, current);
  requireFutureStart(startsAt);
  const venue = body.venue === undefined ? current.venue : requireVenue(body.venue);
  const unchanged =
    startsAt.getTime() === current.scheduledAt.getTime() &&
    (endsAt?.getTime() || 0) === (current.endsAt?.getTime() || 0) &&
    venue === current.venue;
  if (unchanged) {
    throw new ValidationError('Nothing has changed. Change the date, time or venue to reschedule.');
  }

  const notice = await CaExamNotice.findOneAndUpdate(
    { _id: current._id, status: 'PUBLISHED', generation: current.generation },
    {
      $set: { scheduledAt: startsAt, endsAt: endsAt || null, venue },
      $inc: { generation: 1 },
      $push: {
        history: {
          generation: current.generation + 1,
          action: 'RESCHEDULED',
          scheduledAt: startsAt,
          endsAt,
          venue,
          actorUserId: principal.userId,
          reason: String(body.reason || '').trim(),
          at: new Date(),
        },
      },
    },
    { new: true },
  );
  if (!notice) {
    throw new ConflictError('The examination notice changed. Reload and try again.');
  }
  await CalendarEvent.updateOne(
    { _id: notice.calendarEventId },
    { $set: { startsAt, endsAt: endsAt || null, details: venue }, $inc: { reminderGeneration: 1 } },
  );
  // Anything still waiting from an older generation must never be sent.
  await cancelNotificationsFor({ noticeId: notice._id, beforeGeneration: notice.generation }, 'superseded');

  const subject = await Subject.findById(notice.subjectId);
  const oldSchedules = await CaSchedule.find({ examNoticeId: notice._id, status: 'ACTIVE' });
  const moved = [];
  for (const old of oldSchedules) {
    const superseded = await CaSchedule.findOneAndUpdate(
      { _id: old._id, status: 'ACTIVE' },
      { $set: { status: 'SUPERSEDED', supersededAt: new Date() } },
    );
    if (!superseded) {
      continue;
    }
    const schedule = await CaSchedule.create({
      departmentId: old.departmentId,
      applicationId: old.applicationId,
      incompleteCaId: old.incompleteCaId,
      subjectOfferingId: old.subjectOfferingId,
      lecturerUserId: old.lecturerUserId,
      calendarEventId: old.calendarEventId,
      examNoticeId: notice._id,
      generation: notice.generation,
      status: 'ACTIVE',
      scheduledAt: startsAt,
      endsAt,
      venue,
    });
    const link = await CaApplicationSubject.findOneAndUpdate(
      { applicationId: old.applicationId, incompleteCaId: old.incompleteCaId, examStatus: 'SCHEDULED' },
      { $set: { activeScheduleId: schedule._id, statusChangedAt: new Date() } },
      { new: true },
    );
    if (!link) {
      await CaSchedule.deleteOne({ _id: schedule._id });
      continue;
    }
    const application = await CaApplication.findById(old.applicationId);
    moved.push({ link, application, subject });
  }
  for (const entry of moved) {
    const { vars, templateParams } = buildCaMessage({
      type: 'CA_EXAM_RESCHEDULED',
      subject,
      notice,
      application: entry.application,
    });
    await emitCaNotification({
      recipientUserId: entry.application.studentUserId,
      type: 'CA_EXAM_RESCHEDULED',
      sourceId: noticeSourceId(notice, entry.link),
      departmentId: entry.application.departmentId,
      infrastructure,
      vars,
      templateParams,
      guardRef: guardRefFor(notice, entry.link),
    });
  }
  const reminders = await queueRemindersForLinks({ notice, entries: moved, infrastructure });
  const offering = await SubjectOffering.findById(notice.subjectOfferingId);
  if (offering) {
    await notifyBatchStudents({
      type: 'CA_EXAM_RESCHEDULED',
      notice,
      subject,
      offering,
      excludeUserIds: moved.map((entry) => entry.application.studentUserId),
      withReminders: true,
      infrastructure,
    });
  }
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'ca.exam-notice.reschedule',
    entityType: 'CaExamNotice',
    entityId: notice._id,
    departmentId: notice.departmentId,
    metadata: { generation: notice.generation, students: moved.length, skippedReminderOffsets: reminders.skipped },
  });
  return mapNotice(notice, { subject, studentCount: moved.length });
}

export async function cancelExamNotice(principal, noticeId, body = {}, { infrastructure } = {}) {
  requireObjectId(noticeId, 'exam notice');
  const current = await CaExamNotice.findById(noticeId);
  if (!current) {
    throw new NotFoundError('Exam notice not found');
  }
  await requireManagedOffering(principal, current.subjectOfferingId);
  const reason = String(body.reason || '').trim();
  if (!reason) {
    throw new ValidationError('A cancellation reason is required');
  }
  const cancelledAt = new Date();
  const notice = await CaExamNotice.findOneAndUpdate(
    { _id: current._id, status: 'PUBLISHED' },
    {
      $set: { status: 'CANCELLED', cancelledAt, cancelledByUserId: principal.userId, cancelReason: reason },
      $push: {
        history: {
          generation: current.generation,
          action: 'CANCELLED',
          scheduledAt: current.scheduledAt,
          endsAt: current.endsAt,
          venue: current.venue,
          actorUserId: principal.userId,
          reason,
          at: cancelledAt,
        },
      },
    },
    { new: true },
  );
  if (!notice) {
    throw new ValidationError('This examination notice is already cancelled');
  }
  await CalendarEvent.updateOne(
    { _id: notice.calendarEventId },
    { $set: { cancelledAt, reminderEnabled: false, details: `${notice.venue} (cancelled)` } },
  );
  await cancelNotificationsFor({ noticeId: notice._id }, 'exam_cancelled');

  const subject = await Subject.findById(notice.subjectId);
  const schedules = await CaSchedule.find({ examNoticeId: notice._id, status: 'ACTIVE' });
  const notifiedStudentIds = [];
  let affected = 0;
  for (const schedule of schedules) {
    const cancelled = await CaSchedule.findOneAndUpdate(
      { _id: schedule._id, status: 'ACTIVE' },
      { $set: { status: 'CANCELLED', cancelledAt } },
    );
    if (!cancelled) {
      continue;
    }
    // Only this subject's link moves back; other subjects of the same application are untouched.
    const link = await CaApplicationSubject.findOneAndUpdate(
      { applicationId: schedule.applicationId, incompleteCaId: schedule.incompleteCaId, examStatus: 'SCHEDULED' },
      { $set: { examStatus: 'READY_TO_SCHEDULE', statusChangedAt: cancelledAt }, $unset: { activeScheduleId: '' } },
      { new: true },
    );
    const application = await CaApplication.findById(schedule.applicationId);
    if (!link || !application) {
      continue;
    }
    affected += 1;
    await syncApplicationStatusFromSubjects(application._id, {
      actorUserId: principal.userId,
      linkId: String(link._id),
      reason: `CA examination cancelled for ${subject?.code || 'subject'}`,
    });
    const { vars, templateParams } = buildCaMessage({
      type: 'CA_EXAM_CANCELLED',
      subject,
      notice,
      application,
      reason,
    });
    await emitCaNotification({
      recipientUserId: application.studentUserId,
      type: 'CA_EXAM_CANCELLED',
      sourceId: `${notice._id}:${notice.generation}:${link._id}`,
      departmentId: application.departmentId,
      infrastructure,
      vars,
      templateParams,
    });
    notifiedStudentIds.push(application.studentUserId);
  }
  const offering = await SubjectOffering.findById(notice.subjectOfferingId);
  if (offering) {
    await notifyBatchStudents({
      type: 'CA_EXAM_CANCELLED',
      notice,
      subject,
      offering,
      excludeUserIds: notifiedStudentIds,
      reason,
      infrastructure,
    });
  }
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'ca.exam-notice.cancel',
    entityType: 'CaExamNotice',
    entityId: notice._id,
    departmentId: notice.departmentId,
    metadata: { students: affected, reason },
  });
  return mapNotice(notice, { subject, studentCount: 0 });
}

/** Complete one subject. Never completes the application unless every other subject is also done. */
export async function completeSubject(principal, { linkId }) {
  assertLecturer(principal);
  requireObjectId(linkId, 'subject link');
  const link = await CaApplicationSubject.findById(linkId);
  if (!link || !link.subjectOfferingId) {
    throw new NotFoundError('Subject not found');
  }
  await requireManagedOffering(principal, link.subjectOfferingId);
  if (!['SCHEDULED', 'READY_TO_SCHEDULE'].includes(link.examStatus)) {
    throw new ValidationError('This subject is not ready to complete');
  }
  const completedAt = new Date();
  const claimed = await CaApplicationSubject.findOneAndUpdate(
    { _id: link._id, examStatus: link.examStatus },
    {
      $set: {
        examStatus: 'COMPLETED',
        completedAt,
        completedByUserId: principal.userId,
        statusChangedAt: completedAt,
      },
    },
    { new: true },
  );
  if (!claimed) {
    throw new ConflictError('This subject changed. Reload and try again.');
  }
  const schedule = claimed.activeScheduleId
    ? await CaSchedule.findOneAndUpdate(
        { _id: claimed.activeScheduleId, status: 'ACTIVE' },
        { $set: { status: 'COMPLETED', completedAt } },
        { new: true },
      )
    : null;
  if (schedule?.examNoticeId) {
    await cancelNotificationsFor({ noticeId: schedule.examNoticeId, linkId: claimed._id }, 'subject_completed');
  }
  const application = await CaApplication.findById(claimed.applicationId);
  const subject = await Subject.findById(claimed.subjectId);
  const fromStatus = application.workflowStatus;
  const derived = await syncApplicationStatusFromSubjects(application._id, {
    actorUserId: principal.userId,
    linkId: String(claimed._id),
  });
  await recordLinkEvent({ application, type: 'COMPLETED', actorUserId: principal.userId, fromStatus, subject });
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'ca.subject.complete',
    entityType: 'CaApplicationSubject',
    entityId: claimed._id,
    departmentId: application.departmentId,
    metadata: { applicationId: application.applicationId, subjectCode: subject?.code },
  });
  return {
    applicationId: application.applicationId,
    linkId: String(claimed._id),
    examStatus: 'COMPLETED',
    workflowStatus: derived.workflowStatus || application.workflowStatus,
  };
}

/** Scheduled subject links of a published notice, with their ACTIVE schedule. */
async function scheduledLinksForNotice(notice) {
  const schedules = await CaSchedule.find({ examNoticeId: notice._id, status: 'ACTIVE' });
  const links = await CaApplicationSubject.find({
    activeScheduleId: { $in: schedules.map((item) => item._id) },
    examStatus: 'SCHEDULED',
  });
  return links;
}

async function loadAttendanceNotice(principal, noticeId) {
  requireObjectId(noticeId, 'exam notice');
  const notice = await CaExamNotice.findById(noticeId);
  if (!notice) {
    throw new NotFoundError('Exam notice not found');
  }
  await requireManagedOffering(principal, notice.subjectOfferingId);
  if (notice.status !== 'PUBLISHED') {
    throw new ValidationError('This examination notice is not active');
  }
  if (notice.scheduledAt.getTime() > Date.now()) {
    throw new ValidationError('Attendance can be recorded once the examination has started');
  }
  return notice;
}

/** Record who attended. Does not change any status; the lecturer confirms afterwards. */
export async function markAttendance(principal, noticeId, body) {
  const notice = await loadAttendanceNotice(principal, noticeId);
  const entries = Array.isArray(body?.attendance) ? body.attendance : [];
  if (!entries.length) {
    throw new ValidationError('Attendance entries are required');
  }
  const links = await scheduledLinksForNotice(notice);
  const byId = new Map(links.map((item) => [String(item._id), item]));
  const now = new Date();
  for (const entry of entries) {
    if (!byId.has(String(entry?.linkId)) || typeof entry.attended !== 'boolean') {
      throw new ValidationError('Attendance entries must reference students on this notice');
    }
  }
  for (const entry of entries) {
    await CaApplicationSubject.updateOne(
      { _id: entry.linkId, examStatus: 'SCHEDULED' },
      { $set: { attended: entry.attended, attendanceMarkedAt: now } },
    );
  }
  return { saved: entries.length };
}

/**
 * Lecturer confirms the CA took place. Attended students -> COMPLETED (awaiting results); absent students ->
 * MISSED and their E(CA) reopens so they can apply in a later application window. All are notified.
 */
export async function confirmNoticeCompletion(principal, noticeId, { infrastructure } = {}) {
  const notice = await loadAttendanceNotice(principal, noticeId);
  const links = await scheduledLinksForNotice(notice);
  if (!links.length) {
    throw new ValidationError('There are no scheduled students to confirm');
  }
  if (links.some((link) => typeof link.attended !== 'boolean')) {
    throw new ValidationError('Record attendance for every student before confirming');
  }
  const subject = await Subject.findById(notice.subjectId);
  const completedAt = new Date();
  const summary = { completed: 0, missed: 0 };
  for (const link of links) {
    const attended = link.attended === true;
    const claimed = await CaApplicationSubject.findOneAndUpdate(
      { _id: link._id, examStatus: 'SCHEDULED' },
      {
        $set: {
          examStatus: attended ? 'COMPLETED' : 'MISSED',
          completedAt,
          completedByUserId: principal.userId,
          statusChangedAt: completedAt,
        },
      },
      { new: true },
    );
    if (!claimed) {
      continue;
    }
    await CaSchedule.updateOne({ _id: claimed.activeScheduleId, status: 'ACTIVE' }, { $set: { status: 'COMPLETED', completedAt } });
    await cancelNotificationsFor({ noticeId: notice._id, linkId: claimed._id }, 'subject_completed');
    if (!attended) {
      await IncompleteCa.updateOne({ _id: claimed.incompleteCaId, status: { $ne: 'RESOLVED' } }, { $set: { status: 'OPEN' } });
    }
    const application = await CaApplication.findById(claimed.applicationId);
    const fromStatus = application.workflowStatus;
    await syncApplicationStatusFromSubjects(application._id, { actorUserId: principal.userId, linkId: String(claimed._id) });
    await recordLinkEvent({
      application,
      type: attended ? 'COMPLETED' : 'MISSED',
      actorUserId: principal.userId,
      fromStatus,
      subject,
      reason: `${attended ? 'Attended' : 'Absent'} - ${subject?.code || ''}`.trim(),
    });
    const type = attended ? 'CA_EXAM_COMPLETED' : 'CA_EXAM_MISSED';
    const { vars, templateParams } = buildCaMessage({ type, subject, notice, application });
    await emitCaNotification({
      recipientUserId: application.studentUserId,
      type,
      sourceId: `${noticeSourceId(notice, claimed)}:${type}`,
      departmentId: application.departmentId,
      infrastructure,
      vars,
      templateParams,
    });
    summary[attended ? 'completed' : 'missed'] += 1;
  }
  notice.status = 'COMPLETED';
  await notice.save();
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'ca.exam-notice.confirm-completion',
    entityType: 'CaExamNotice',
    entityId: notice._id,
    departmentId: notice.departmentId,
    metadata: summary,
  });
  return summary;
}

async function activeStudentCount(noticeId) {
  return CaSchedule.countDocuments({ examNoticeId: noticeId, status: 'ACTIVE' });
}

export function mapNotice(notice, { subject, studentCount, attached } = {}) {
  const when = formatColombo(notice.scheduledAt);
  return {
    id: String(notice._id),
    subjectOfferingId: String(notice.subjectOfferingId),
    subjectId: String(notice.subjectId),
    subjectCode: subject?.code || '',
    subjectName: subject?.name || '',
    scheduledAt: notice.scheduledAt,
    endsAt: notice.endsAt || null,
    venue: notice.venue,
    timezone: notice.timezone,
    localDate: when.date,
    localTime: when.time,
    status: notice.status,
    generation: notice.generation,
    cancelledAt: notice.cancelledAt || null,
    cancelReason: notice.cancelReason || '',
    calendarEventId: String(notice.calendarEventId),
    studentCount: studentCount ?? 0,
    ...(attached === undefined ? {} : { attached }),
    history: (notice.history || []).map((item) => ({
      generation: item.generation,
      action: item.action,
      scheduledAt: item.scheduledAt || null,
      endsAt: item.endsAt || null,
      venue: item.venue || '',
      reason: item.reason || '',
      at: item.at,
    })),
  };
}

export async function listExamNotices(principal) {
  assertLecturer(principal);
  const assignments = await findActiveAssignmentsForLecturer(principal.userId);
  const notices = await CaExamNotice.find({
    subjectOfferingId: { $in: assignments.map((item) => item.subjectOfferingId) },
  }).sort({ scheduledAt: -1 });
  const subjects = await Subject.find({ _id: { $in: notices.map((item) => item.subjectId) } });
  const subjectById = new Map(subjects.map((item) => [String(item._id), item]));
  const items = [];
  for (const notice of notices) {
    items.push(
      mapNotice(notice, {
        subject: subjectById.get(String(notice.subjectId)),
        studentCount: await activeStudentCount(notice._id),
      }),
    );
  }
  return { items };
}

/** Delivery state of a notice's notifications, grouped by channel and status. For the lecturer's own subject only. */
export async function examNoticeDelivery(principal, noticeId) {
  requireObjectId(noticeId, 'exam notice');
  const notice = await CaExamNotice.findById(noticeId);
  if (!notice) {
    throw new NotFoundError('Exam notice not found');
  }
  await requireManagedOffering(principal, notice.subjectOfferingId);
  const rows = await Notification.aggregate([
    {
      $match: {
        sourceModule: 'ca-recovery',
        'guardRef.noticeId': String(notice._id),
        type: { $in: ['CA_EXAM_SCHEDULED', 'CA_EXAM_RESCHEDULED', 'CA_REMINDER'] },
      },
    },
    { $group: { _id: { channel: '$channel', status: '$status' }, count: { $sum: 1 } } },
  ]);
  return { items: rows.map((row) => ({ channel: row._id.channel, status: row._id.status, count: row.count })) };
}
