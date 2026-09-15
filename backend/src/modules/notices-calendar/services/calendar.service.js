import { CalendarEvent } from '../models/calendar-event.model.js';
import {
  findActiveAssignmentsForLecturer,
  findOfferingsForBatchSemester,
  findStudentContextByUserId,
  SubjectOffering,
} from '../../academic-foundation/index.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { JOB_NAMES } from '../../../infrastructure/queue/job-names.js';
import { fanoutNotification } from '../../notifications/index.js';
import { AuditEvent } from '../../audit-security/index.js';
import { parsePagination, requireObjectId } from '../../notifications/utils/http.js';
import { LecturerAssignment } from '../../academic-foundation/index.js';
import { StudentAcademicContext } from '../../academic-foundation/index.js';

function mapEvent(doc) {
  return {
    id: String(doc._id),
    title: doc.title,
    details: doc.details || '',
    eventType: doc.eventType,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt || null,
    timezone: doc.timezone || 'Asia/Colombo',
    allDay: Boolean(doc.allDay),
    publicationState: doc.publicationState,
    cancelledAt: doc.cancelledAt || null,
    subjectOfferingId: doc.subjectOfferingId ? String(doc.subjectOfferingId) : null,
    sourceModule: doc.sourceModule || 'notices-calendar',
    sourceEntityId: doc.sourceEntityId || null,
    reminderEnabled: Boolean(doc.reminderEnabled),
    reminderGeneration: doc.reminderGeneration || 0,
  };
}

async function studentOfferingIds(principal) {
  const context = await findStudentContextByUserId(principal.userId);
  if (!context) {
    return { context: null, offeringIds: [] };
  }
  const offerings = await findOfferingsForBatchSemester({
    batchId: context.batchId,
    academicYearId: context.currentAcademicYearId,
    semesterId: context.currentSemesterId,
  });
  return { context, offeringIds: offerings.map((item) => item._id) };
}

export async function listEvents(principal, query = {}) {
  const from = query.from ? new Date(query.from) : new Date(Date.now() - 7 * 24 * 3600_000);
  const to = query.to ? new Date(query.to) : new Date(Date.now() + 60 * 24 * 3600_000);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = CalendarEvent.activeFilter({
    startsAt: { $gte: from, $lte: to },
  });
  if (query.eventType) {
    filter.eventType = String(query.eventType);
  }
  if (principal.role === ROLES.DEPARTMENT_ADMINISTRATOR) {
    filter.departmentId = principal.departmentId;
    if (query.publicationState) {
      filter.publicationState = String(query.publicationState);
    }
  } else {
    filter.publicationState = 'PUBLISHED';
    if (principal.role === ROLES.LECTURER) {
      const assignments = await findActiveAssignmentsForLecturer(principal.userId);
      filter.$or = [
        { eventType: 'DEPARTMENT', departmentId: principal.departmentId },
        { subjectOfferingId: { $in: assignments.map((item) => item.subjectOfferingId) } },
        { createdByUserId: principal.userId },
      ];
    } else {
      const { context, offeringIds } = await studentOfferingIds(principal);
      filter.$or = [
        { eventType: 'DEPARTMENT', departmentId: principal.departmentId },
        { subjectOfferingId: { $in: offeringIds } },
      ];
      if (context) {
        filter.$or.push({ batchId: context.batchId });
      }
    }
  }
  const [items, total] = await Promise.all([
    CalendarEvent.find(filter).sort({ startsAt: 1 }).skip(skip).limit(limit),
    CalendarEvent.countDocuments(filter),
  ]);
  return { items: items.map(mapEvent), total, page, pageSize };
}

export async function upcomingEvents(principal) {
  const result = await listEvents(principal, {
    from: new Date().toISOString(),
    to: new Date(Date.now() + 14 * 24 * 3600_000).toISOString(),
    pageSize: 10,
  });
  return { items: result.items };
}

export async function getEvent(principal, eventId) {
  requireObjectId(eventId, 'event');
  const event = await CalendarEvent.findById(eventId);
  if (!event || event.cancelledAt) {
    throw new NotFoundError('Event not found');
  }
  const listed = await listEvents(principal, {
    from: event.startsAt.toISOString(),
    to: event.startsAt.toISOString(),
    pageSize: 50,
  });
  if (listed.items.some((item) => item.id === String(event._id))) {
    return mapEvent(event);
  }
  if (
    principal.role === ROLES.DEPARTMENT_ADMINISTRATOR &&
    String(event.departmentId || '') === String(principal.departmentId || '')
  ) {
    return mapEvent(event);
  }
  throw new NotFoundError('Event not found');
}

async function queueReminders(event, infrastructure) {
  const hours = Array.isArray(event.reminderOffsetsHours) ? event.reminderOffsetsHours : [];
  if (!event.reminderEnabled || !hours.length || !infrastructure?.queue?.enqueue) {
    return;
  }
  for (const offsetHours of hours) {
    await infrastructure.queue.enqueue({
      name: JOB_NAMES.REMINDER_SCHEDULE,
      payload: {
        calendarEventId: String(event._id),
        offsetHours,
        generation: event.reminderGeneration || 0,
      },
      jobId: `cal.reminder:${event._id}:${offsetHours}:${event.reminderGeneration || 0}`,
    });
  }
}

function parseEventBody(body, { timezone }) {
  const title = String(body.title || '').trim();
  const startsAt = new Date(body.startsAt);
  if (!title || Number.isNaN(startsAt.getTime())) {
    throw new ValidationError('Title and start time are required');
  }
  return {
    title,
    details: String(body.details || '').trim(),
    startsAt,
    endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
    timezone: timezone || 'Asia/Colombo',
    allDay: Boolean(body.allDay),
    eventType: body.eventType === 'ASSIGNMENT_DEADLINE' ? 'ASSIGNMENT_DEADLINE' : 'DEPARTMENT',
    reminderEnabled: Boolean(body.reminderEnabled),
    reminderOffsetsHours: Array.isArray(body.reminderOffsetsHours)
      ? body.reminderOffsetsHours.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
      : [],
  };
}

export async function createAdminEvent(principal, body, { config, infrastructure }) {
  if (principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR || !principal.departmentId) {
    throw new ForbiddenError('Forbidden');
  }
  const parsed = parseEventBody(body, { timezone: config?.timezone });
  if (body.sourceModule || body.sourceEntityId) {
    throw new ForbiddenError('Forbidden');
  }
  const event = await CalendarEvent.create({
    ...parsed,
    createdByUserId: principal.userId,
    departmentId: principal.departmentId,
    publicationState: body.publish === false ? 'DRAFT' : 'PUBLISHED',
    academicYearId: body.academicYearId,
    semesterId: body.semesterId,
    batchId: body.batchId,
    subjectOfferingId: body.subjectOfferingId,
    sourceModule: 'notices-calendar',
  });
  await queueReminders(event, infrastructure);
  await AuditEvent.create({
    actorUserId: principal.userId,
    action: 'calendar.create',
    entityType: 'CalendarEvent',
    entityId: String(event._id),
    occurredAt: new Date(),
  });
  return mapEvent(event);
}

export async function createLecturerEvent(principal, body, { config, infrastructure }) {
  if (principal.role !== ROLES.LECTURER) {
    throw new ForbiddenError('Forbidden');
  }
  requireObjectId(body.subjectOfferingId, 'subject offering');
  const assignments = await findActiveAssignmentsForLecturer(principal.userId);
  if (!assignments.some((item) => String(item.subjectOfferingId) === String(body.subjectOfferingId))) {
    throw new ForbiddenError('Forbidden');
  }
  const offering = await SubjectOffering.findById(body.subjectOfferingId);
  if (!offering) {
    throw new NotFoundError('Subject offering not found');
  }
  const parsed = parseEventBody({ ...body, eventType: 'ASSIGNMENT_DEADLINE' }, { timezone: config?.timezone });
  const event = await CalendarEvent.create({
    ...parsed,
    eventType: 'ASSIGNMENT_DEADLINE',
    createdByUserId: principal.userId,
    departmentId: offering.departmentId,
    publicationState: 'PUBLISHED',
    subjectOfferingId: offering._id,
    academicYearId: offering.academicYearId,
    semesterId: offering.semesterId,
    batchId: offering.batchId,
    sourceModule: 'notices-calendar',
  });
  await queueReminders(event, infrastructure);
  await AuditEvent.create({
    actorUserId: principal.userId,
    action: 'calendar.lecturer.create',
    entityType: 'CalendarEvent',
    entityId: String(event._id),
    occurredAt: new Date(),
  });
  return mapEvent(event);
}

export async function updateEvent(principal, eventId, body, { infrastructure }) {
  requireObjectId(eventId, 'event');
  const event = await CalendarEvent.findById(eventId);
  if (!event || event.cancelledAt) {
    throw new NotFoundError('Event not found');
  }
  if (event.sourceModule === 'ca-recovery' || event.eventType === 'CA_SCHEDULE') {
    throw new ForbiddenError('CA schedules are managed in CA Recovery');
  }
  const admin = principal.role === ROLES.DEPARTMENT_ADMINISTRATOR && String(event.departmentId) === String(principal.departmentId);
  const lecturerOwner =
    principal.role === ROLES.LECTURER && String(event.createdByUserId) === String(principal.userId);
  if (!admin && !lecturerOwner) {
    throw new ForbiddenError('Forbidden');
  }
  if (body.title) {
    event.title = String(body.title).trim();
  }
  if (body.startsAt) {
    const startsAt = new Date(body.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new ValidationError('A valid start time is required');
    }
    if (startsAt.getTime() !== event.startsAt.getTime()) {
      event.startsAt = startsAt;
      event.reminderGeneration = (event.reminderGeneration || 0) + 1;
    }
  }
  if (body.details !== undefined) {
    event.details = String(body.details);
  }
  await event.save();
  await queueReminders(event, infrastructure);
  await AuditEvent.create({
    actorUserId: principal.userId,
    action: 'calendar.update',
    entityType: 'CalendarEvent',
    entityId: String(event._id),
    metadata: { reminderGeneration: event.reminderGeneration },
    occurredAt: new Date(),
  });
  return mapEvent(event);
}

export async function publishEvent(principal, eventId) {
  if (principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR) {
    throw new ForbiddenError('Forbidden');
  }
  requireObjectId(eventId, 'event');
  const event = await CalendarEvent.findOne({ _id: eventId, departmentId: principal.departmentId });
  if (!event) {
    throw new NotFoundError('Event not found');
  }
  event.publicationState = 'PUBLISHED';
  await event.save();
  await AuditEvent.create({
    actorUserId: principal.userId,
    action: 'calendar.publish',
    entityType: 'CalendarEvent',
    entityId: String(event._id),
    occurredAt: new Date(),
  });
  return mapEvent(event);
}

export async function cancelEvent(principal, eventId) {
  requireObjectId(eventId, 'event');
  const event = await CalendarEvent.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found');
  }
  if (event.sourceModule === 'ca-recovery' || event.eventType === 'CA_SCHEDULE') {
    throw new ForbiddenError('CA schedules are managed in CA Recovery');
  }
  const admin = principal.role === ROLES.DEPARTMENT_ADMINISTRATOR && String(event.departmentId) === String(principal.departmentId);
  const lecturerOwner =
    principal.role === ROLES.LECTURER && String(event.createdByUserId) === String(principal.userId);
  if (!admin && !lecturerOwner) {
    throw new ForbiddenError('Forbidden');
  }
  event.cancelledAt = new Date();
  event.reminderEnabled = false;
  event.reminderGeneration = (event.reminderGeneration || 0) + 1;
  await event.save();
  await AuditEvent.create({
    actorUserId: principal.userId,
    action: 'calendar.cancel',
    entityType: 'CalendarEvent',
    entityId: String(event._id),
    occurredAt: new Date(),
  });
  return mapEvent(event);
}

export async function evaluateCalendarReminder({ calendarEventId, offsetHours, generation, now = new Date(), infrastructure }) {
  const event = await CalendarEvent.findById(calendarEventId);
  if (!event || event.cancelledAt || event.publicationState !== 'PUBLISHED' || !event.reminderEnabled) {
    return { sent: false, reason: 'INACTIVE' };
  }
  if ((event.reminderGeneration || 0) !== generation) {
    return { sent: false, reason: 'STALE' };
  }
  const fireAt = new Date(event.startsAt.getTime() - Number(offsetHours) * 3600 * 1000);
  if (now.getTime() < fireAt.getTime()) {
    return { sent: false, reason: 'TOO_EARLY' };
  }
  const recipientIds = new Set();
  if (event.subjectOfferingId) {
    const assignments = await LecturerAssignment.find({
      subjectOfferingId: event.subjectOfferingId,
      isActive: true,
    }).select('lecturerUserId');
    for (const row of assignments) {
      recipientIds.add(String(row.lecturerUserId));
    }
    const offering = await SubjectOffering.findById(event.subjectOfferingId);
    if (offering) {
      const students = await StudentAcademicContext.find({
        batchId: offering.batchId,
        currentAcademicYearId: offering.academicYearId,
        currentSemesterId: offering.semesterId,
      }).select('userId');
      for (const row of students) {
        recipientIds.add(String(row.userId));
      }
    }
  } else if (event.departmentId) {
    const students = await StudentAcademicContext.find({ departmentId: event.departmentId }).select('userId');
    for (const row of students) {
      recipientIds.add(String(row.userId));
    }
  }
  let created = 0;
  for (const recipientUserId of recipientIds) {
    const result = await fanoutNotification({
      recipientUserId,
      type: 'CALENDAR_REMINDER',
      sourceModule: 'notices-calendar',
      sourceId: String(event._id),
      reminderOffsetHours: Number(offsetHours),
      reminderGeneration: generation,
      departmentId: event.departmentId,
      actionPath: '/calendar',
      vars: { eventTitle: event.title, when: event.startsAt.toISOString() },
      infrastructure,
    });
    created += result.created;
  }
  return { sent: created > 0, created };
}
