import { CaApplication } from '../models/ca-application.model.js';
import { CaApplicationSubject } from '../models/ca-application-subject.model.js';
import { CaSchedule } from '../models/ca-schedule.model.js';
import { IncompleteCa } from '../models/incomplete-ca.model.js';
import { CalendarEvent } from '../../notices-calendar/index.js';
import { findActiveAssignmentsForLecturer, SubjectOffering } from '../../academic-foundation/index.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { requireObjectId } from '../utils/http.js';
import { emitCaNotification, recordCaAudit } from './notify.js';
import { CaApplicationEvent } from '../models/ca-application-event.model.js';
import { queueRemindersForSchedule } from './reminder.service.js';

function assertLecturer(principal) {
  if (!principal || principal.role !== ROLES.LECTURER) {
    throw new ForbiddenError('Forbidden');
  }
}

export async function listApprovedForLecturer(principal) {
  assertLecturer(principal);
  const assignments = await findActiveAssignmentsForLecturer(principal.userId);
  const offeringIds = assignments.map((item) => item.subjectOfferingId);
  const offerings = await SubjectOffering.find({ _id: { $in: offeringIds } });
  const offeringById = new Map(offerings.map((item) => [String(item._id), item]));
  const links = await CaApplicationSubject.find({
    subjectOfferingId: { $in: offeringIds },
  });
  const applications = await CaApplication.find({
    _id: { $in: links.map((item) => item.applicationId) },
    workflowStatus: { $in: ['APPROVED', 'SCHEDULED', 'COMPLETED'] },
  });
  const byId = new Map(applications.map((item) => [String(item._id), item]));
  const items = [];
  for (const link of links) {
    const application = byId.get(String(link.applicationId));
    if (!application) {
      continue;
    }
    const offering = offeringById.get(String(link.subjectOfferingId));
    items.push({
      applicationId: application.applicationId,
      registrationNumber: application.registrationNumber,
      workflowStatus: application.workflowStatus,
      subjectOfferingId: String(link.subjectOfferingId),
      subjectId: offering ? String(offering.subjectId) : String(link.subjectId),
      incompleteCaId: String(link.incompleteCaId),
    });
  }
  return { items };
}

export async function createSchedule(principal, body, { infrastructure }) {
  assertLecturer(principal);
  requireObjectId(body.subjectOfferingId, 'subject offering');
  const assignments = await findActiveAssignmentsForLecturer(principal.userId);
  if (!assignments.some((item) => String(item.subjectOfferingId) === String(body.subjectOfferingId))) {
    throw new ForbiddenError('Forbidden');
  }
  const offering = await SubjectOffering.findById(body.subjectOfferingId);
  if (!offering) {
    throw new NotFoundError('Subject offering not found');
  }
  const application = await CaApplication.findOne({ applicationId: String(body.applicationId || '').trim() });
  if (!application || !['APPROVED', 'SCHEDULED'].includes(application.workflowStatus)) {
    throw new NotFoundError('Approved application not found');
  }
  requireObjectId(body.incompleteCaId, 'incomplete CA');
  const link = await CaApplicationSubject.findOne({
    applicationId: application._id,
    incompleteCaId: body.incompleteCaId,
    subjectOfferingId: offering._id,
  });
  if (!link) {
    throw new ForbiddenError('Forbidden');
  }
  const scheduledAt = new Date(body.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new ValidationError('A valid schedule time is required');
  }
  const endsAt = body.endsAt ? new Date(body.endsAt) : undefined;
  const venue = String(body.venue || '').trim();

  let calendar;
  try {
    calendar = await CalendarEvent.create({
      title: `CA recovery ${application.applicationId}`,
      details: venue,
      startsAt: scheduledAt,
      endsAt,
      timezone: 'Asia/Colombo',
      createdByUserId: principal.userId,
      departmentId: application.departmentId,
      eventType: 'CA_SCHEDULE',
      publicationState: 'PUBLISHED',
      academicYearId: application.academicYearId,
      semesterId: application.semesterId,
      subjectOfferingId: offering._id,
      sourceModule: 'ca-recovery',
      sourceEntityId: String(application._id),
      reminderEnabled: true,
    });
  } catch (error) {
    throw new ValidationError('Calendar event could not be created');
  }

  let schedule;
  try {
    schedule = await CaSchedule.create({
      departmentId: application.departmentId,
      applicationId: application._id,
      incompleteCaId: link.incompleteCaId,
      subjectOfferingId: offering._id,
      lecturerUserId: principal.userId,
      calendarEventId: calendar._id,
      scheduledAt,
      endsAt,
      venue,
    });
  } catch (error) {
    await CalendarEvent.deleteOne({ _id: calendar._id });
    if (error?.code === 11000) {
      throw new ValidationError('A schedule already exists for this subject');
    }
    throw error;
  }

  if (application.workflowStatus === 'APPROVED') {
    application.workflowStatus = 'SCHEDULED';
    await application.save();
    await CaApplicationEvent.create({
      applicationId: application._id,
      type: 'SCHEDULED',
      actorUserId: principal.userId,
      fromStatus: 'APPROVED',
      toStatus: 'SCHEDULED',
      occurredAt: new Date(),
    });
  }
  await emitCaNotification({
    recipientUserId: application.studentUserId,
    type: 'CA_SCHEDULED',
    sourceId: String(schedule._id),
  });
  await queueRemindersForSchedule(schedule, application, infrastructure);
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'ca.schedule.create',
    entityType: 'CaSchedule',
    entityId: schedule._id,
    metadata: { applicationId: application.applicationId },
  });
  return mapSchedule(schedule);
}

export async function listSchedules(principal) {
  assertLecturer(principal);
  const assignments = await findActiveAssignmentsForLecturer(principal.userId);
  const items = await CaSchedule.find({
    lecturerUserId: principal.userId,
    subjectOfferingId: { $in: assignments.map((item) => item.subjectOfferingId) },
  }).sort({ scheduledAt: 1 });
  return { items: items.map(mapSchedule) };
}

export async function cancelSchedule(principal, scheduleId) {
  assertLecturer(principal);
  requireObjectId(scheduleId, 'schedule');
  const schedule = await CaSchedule.findById(scheduleId);
  if (!schedule || String(schedule.lecturerUserId) !== String(principal.userId)) {
    throw new NotFoundError('Schedule not found');
  }
  const cancelledAt = new Date();
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
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'ca.schedule.cancel',
    entityType: 'CaSchedule',
    entityId: schedule._id,
    metadata: { calendarEventId: String(schedule.calendarEventId) },
  });
  return mapSchedule(schedule);
}

export async function completeApplication(principal, applicationId) {
  assertLecturer(principal);
  const application = await CaApplication.findOne({ applicationId });
  if (!application) {
    throw new NotFoundError('Application not found');
  }
  const assignments = await findActiveAssignmentsForLecturer(principal.userId);
  const link = await CaApplicationSubject.findOne({
    applicationId: application._id,
    subjectOfferingId: { $in: assignments.map((item) => item.subjectOfferingId) },
  });
  if (!link) {
    throw new ForbiddenError('Forbidden');
  }
  if (!['SCHEDULED', 'APPROVED'].includes(application.workflowStatus)) {
    throw new ValidationError('Application is not ready to complete');
  }
  application.workflowStatus = 'COMPLETED';
  await application.save();
  await CaApplicationEvent.create({
    applicationId: application._id,
    type: 'COMPLETED',
    actorUserId: principal.userId,
    fromStatus: 'SCHEDULED',
    toStatus: 'COMPLETED',
    occurredAt: new Date(),
  });
  return { applicationId: application.applicationId, workflowStatus: application.workflowStatus };
}

function mapSchedule(doc) {
  return {
    id: String(doc._id),
    applicationId: String(doc.applicationId),
    incompleteCaId: String(doc.incompleteCaId),
    subjectOfferingId: String(doc.subjectOfferingId),
    scheduledAt: doc.scheduledAt,
    endsAt: doc.endsAt || null,
    venue: doc.venue || '',
    cancelledAt: doc.cancelledAt || null,
    calendarEventId: String(doc.calendarEventId),
  };
}
