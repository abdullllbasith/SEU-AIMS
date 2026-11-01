import { CaApplication } from '../models/ca-application.model.js';
import { CaApplicationSubject } from '../models/ca-application-subject.model.js';
import { CaExamNotice } from '../models/ca-exam-notice.model.js';
import { CaSchedule } from '../models/ca-schedule.model.js';
import { CalendarEvent } from '../../notices-calendar/index.js';
import { Notification } from '../../notifications/index.js';
import { Subject, findActiveAssignmentsForLecturer, SubjectOffering } from '../../academic-foundation/index.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { requireObjectId } from '../utils/http.js';
import { recordCaAudit } from './notify.js';
import { syncApplicationStatusFromSubjects } from './application-status.service.js';
import { relinkApprovedLinks } from './reconciliation.service.js';
import { attachLinksToExistingNotice, completeSubject, publishExamNotice } from './exam-notice.service.js';

function assertLecturer(principal) {
  if (!principal || principal.role !== ROLES.LECTURER) {
    throw new ForbiddenError('Forbidden');
  }
}

/** Subject links on the lecturer's own active offerings that are approved (ready, scheduled or completed). */
export async function listApprovedForLecturer(principal) {
  assertLecturer(principal);
  if (principal.departmentId) {
    await relinkApprovedLinks(principal.departmentId);
  }
  const assignments = await findActiveAssignmentsForLecturer(principal.userId);
  const offerings = await SubjectOffering.find({
    _id: { $in: assignments.map((item) => item.subjectOfferingId) },
    status: 'ACTIVE',
  });
  const offeringById = new Map(offerings.map((item) => [String(item._id), item]));
  const links = await CaApplicationSubject.find({
    subjectOfferingId: { $in: offerings.map((item) => item._id) },
    examStatus: { $in: ['READY_TO_SCHEDULE', 'SCHEDULED', 'COMPLETED', 'MISSED'] },
  });
  const applications = await CaApplication.find({ _id: { $in: links.map((item) => item.applicationId) } });
  const applicationById = new Map(applications.map((item) => [String(item._id), item]));
  const subjects = await Subject.find({ _id: { $in: links.map((item) => item.subjectId) } });
  const subjectById = new Map(subjects.map((item) => [String(item._id), item]));
  const notices = await CaExamNotice.find({
    subjectOfferingId: { $in: offerings.map((item) => item._id) },
    status: 'PUBLISHED',
  });
  const noticeByOffering = new Map(notices.map((item) => [String(item.subjectOfferingId), item]));
  const items = [];
  for (const link of links) {
    const application = applicationById.get(String(link.applicationId));
    const offering = offeringById.get(String(link.subjectOfferingId));
    if (!application || !offering) {
      continue;
    }
    const subject = subjectById.get(String(link.subjectId));
    const notice = noticeByOffering.get(String(link.subjectOfferingId));
    items.push({
      linkId: String(link._id),
      applicationId: application.applicationId,
      registrationNumber: application.registrationNumber,
      workflowStatus: application.workflowStatus,
      examStatus: link.examStatus,
      attended: typeof link.attended === 'boolean' ? link.attended : null,
      subjectOfferingId: String(link.subjectOfferingId),
      subjectId: String(offering.subjectId),
      subjectCode: subject?.code || '',
      subjectName: subject?.name || '',
      incompleteCaId: String(link.incompleteCaId),
      examNotice: notice
        ? { id: String(notice._id), scheduledAt: notice.scheduledAt, venue: notice.venue, generation: notice.generation }
        : null,
    });
  }
  return { items };
}

/**
 * @deprecated Use publishExamNotice. This endpoint now delegates to the subject-level notice workflow so
 * it can never schedule without the student notifications and reminders.
 */
export async function createSchedule(principal, body, { infrastructure } = {}) {
  assertLecturer(principal);
  requireObjectId(body.subjectOfferingId, 'subject offering');
  requireObjectId(body.incompleteCaId, 'incomplete CA');
  const application = await CaApplication.findOne({ applicationId: String(body.applicationId || '').trim() });
  if (!application || !['APPROVED', 'SCHEDULED'].includes(application.workflowStatus)) {
    throw new NotFoundError('Approved application not found');
  }
  const link = await CaApplicationSubject.findOne({
    applicationId: application._id,
    incompleteCaId: body.incompleteCaId,
    subjectOfferingId: body.subjectOfferingId,
  });
  if (!link) {
    throw new ForbiddenError('Forbidden');
  }
  if (link.examStatus !== 'READY_TO_SCHEDULE') {
    throw new ValidationError('A schedule already exists for this subject');
  }
  const existing = await CaExamNotice.findOne({ subjectOfferingId: link.subjectOfferingId, status: 'PUBLISHED' });
  if (existing) {
    await attachLinksToExistingNotice(principal, existing, [link._id], { infrastructure });
  } else {
    await publishExamNotice(principal, { ...body, linkIds: [String(link._id)] }, { infrastructure });
  }
  const schedule = await CaSchedule.findOne({
    applicationId: application._id,
    incompleteCaId: link.incompleteCaId,
    status: 'ACTIVE',
  });
  if (!schedule) {
    throw new ConflictError('The schedule could not be created');
  }
  return { ...mapSchedule(schedule), deprecated: true };
}

export async function listSchedules(principal) {
  assertLecturer(principal);
  const assignments = await findActiveAssignmentsForLecturer(principal.userId);
  const items = await CaSchedule.find({
    subjectOfferingId: { $in: assignments.map((item) => item.subjectOfferingId) },
  }).sort({ scheduledAt: 1 });
  return { items: items.map(mapSchedule) };
}

/**
 * @deprecated Cancel the exam notice instead. A schedule that belongs to a notice cannot be cancelled
 * one student at a time. Only legacy rows created before notices existed are cancelled here, for that
 * one subject only.
 */
export async function cancelSchedule(principal, scheduleId) {
  assertLecturer(principal);
  requireObjectId(scheduleId, 'schedule');
  const schedule = await CaSchedule.findById(scheduleId);
  const assignments = await findActiveAssignmentsForLecturer(principal.userId);
  if (
    !schedule ||
    !assignments.some((item) => String(item.subjectOfferingId) === String(schedule.subjectOfferingId))
  ) {
    throw new NotFoundError('Schedule not found');
  }
  if (schedule.examNoticeId) {
    throw new ConflictError('This schedule belongs to an examination notice. Cancel the exam notice for this subject.');
  }
  if (schedule.status !== 'ACTIVE') {
    throw new ValidationError('This schedule is no longer active');
  }
  const cancelledAt = new Date();
  schedule.status = 'CANCELLED';
  schedule.cancelledAt = cancelledAt;
  await schedule.save();
  await CalendarEvent.updateOne(
    { _id: schedule.calendarEventId },
    {
      $set: {
        cancelledAt,
        reminderEnabled: false,
        details: schedule.venue ? `${schedule.venue} (cancelled)` : 'Cancelled',
      },
    },
  );
  await Notification.updateMany(
    {
      sourceModule: 'ca-recovery',
      sourceId: String(schedule._id),
      status: { $in: ['SCHEDULED', 'PENDING', 'RETRYING'] },
    },
    { $set: { status: 'CANCELLED', failureCode: 'exam_cancelled', errorCategory: 'cancelled', failedAt: cancelledAt } },
  );
  const link = await CaApplicationSubject.findOneAndUpdate(
    { applicationId: schedule.applicationId, incompleteCaId: schedule.incompleteCaId, examStatus: 'SCHEDULED' },
    { $set: { examStatus: 'READY_TO_SCHEDULE', statusChangedAt: cancelledAt }, $unset: { activeScheduleId: '' } },
  );
  await syncApplicationStatusFromSubjects(schedule.applicationId, {
    actorUserId: principal.userId,
    linkId: link ? String(link._id) : undefined,
  });
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'ca.schedule.cancel',
    entityType: 'CaSchedule',
    entityId: schedule._id,
    metadata: { calendarEventId: String(schedule.calendarEventId) },
  });
  return mapSchedule(schedule);
}

/**
 * @deprecated Use completeSubject. This completes exactly one subject (never the whole application):
 * `incompleteCaId`/`linkId` selects it, or it defaults to the lecturer's only subject in this application.
 */
export async function completeApplication(principal, applicationId, body = {}) {
  assertLecturer(principal);
  const application = await CaApplication.findOne({ applicationId });
  if (!application) {
    throw new NotFoundError('Application not found');
  }
  const assignments = await findActiveAssignmentsForLecturer(principal.userId);
  const mine = await CaApplicationSubject.find({
    applicationId: application._id,
    subjectOfferingId: { $in: assignments.map((item) => item.subjectOfferingId) },
  });
  if (!mine.length) {
    throw new ForbiddenError('Forbidden');
  }
  let link;
  if (body.linkId) {
    link = mine.find((item) => String(item._id) === String(body.linkId));
  } else if (body.incompleteCaId) {
    link = mine.find((item) => String(item.incompleteCaId) === String(body.incompleteCaId));
  } else if (mine.length === 1) {
    link = mine[0];
  } else {
    throw new ValidationError('This application has several of your subjects. Choose which subject to complete.');
  }
  if (!link) {
    throw new ForbiddenError('Forbidden');
  }
  return completeSubject(principal, { linkId: String(link._id) });
}

export function mapSchedule(doc) {
  return {
    id: String(doc._id),
    applicationId: String(doc.applicationId),
    incompleteCaId: String(doc.incompleteCaId),
    subjectOfferingId: String(doc.subjectOfferingId),
    examNoticeId: doc.examNoticeId ? String(doc.examNoticeId) : null,
    generation: doc.generation || 1,
    status: doc.status || (doc.cancelledAt ? 'CANCELLED' : 'ACTIVE'),
    scheduledAt: doc.scheduledAt,
    endsAt: doc.endsAt || null,
    venue: doc.venue || '',
    cancelledAt: doc.cancelledAt || null,
    calendarEventId: String(doc.calendarEventId),
  };
}
