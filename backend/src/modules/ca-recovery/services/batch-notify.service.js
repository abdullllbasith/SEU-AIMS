import {
  CurriculumMapping,
  StudentAcademicContext,
  SubjectEnrollment,
  offeringMatchesStudentSpecialization,
} from '../../academic-foundation/index.js';
import { User } from '../../authentication/models/user.model.js';
import { Notification } from '../../notifications/index.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';
import { emitCaNotification } from './notify.js';
import { buildCaMessage } from './exam-messages.js';
import { guardRefFor, noticeSourceId, queueRemindersForLinks } from './reminder.service.js';

const log = createLogger({ service: 'ca-recovery' });

/** Stands in for the subject link of a current-batch student, so source ids and guards stay per student. */
function batchLink(userId) {
  return { _id: `batch-${userId}`, batch: true };
}

/** True when this student already received the notice generation as a current-batch student. */
export async function wasNotifiedAsBatch(notice, userId) {
  return Boolean(
    await Notification.exists({
      sourceModule: 'ca-recovery',
      type: { $in: ['CA_EXAM_SCHEDULED', 'CA_EXAM_RESCHEDULED'] },
      sourceId: noticeSourceId(notice, batchLink(userId)),
      recipientUserId: userId,
    }),
  );
}

/**
 * Students who attend this offering in the normal way (the running batch, plus anyone enrolled in it).
 * Same membership rules as the lecturer's offering roster.
 */
export async function listOfferingStudents(offering) {
  const mappings = await CurriculumMapping.find({
    departmentId: offering.departmentId,
    subjectId: offering.subjectId,
    academicYearId: offering.academicYearId,
    semesterId: offering.semesterId,
    status: 'ACTIVE',
  }).select('specialization');
  const [contexts, enrollments] = await Promise.all([
    StudentAcademicContext.find({
      departmentId: offering.departmentId,
      batchId: offering.batchId,
      currentAcademicYearId: offering.academicYearId,
      currentSemesterId: offering.semesterId,
      status: 'ACTIVE',
    }).select('userId registrationNumber specialization'),
    SubjectEnrollment.find({
      departmentId: offering.departmentId,
      batchId: offering.batchId,
      subjectOfferingId: offering._id,
      status: 'ACTIVE',
    }).select('studentUserId registrationNumber'),
  ]);
  const byUser = new Map();
  for (const context of contexts) {
    if (offeringMatchesStudentSpecialization(context.specialization, mappings)) {
      byUser.set(String(context.userId), { userId: String(context.userId), registrationNumber: context.registrationNumber });
    }
  }
  for (const enrollment of enrollments) {
    const userId = String(enrollment.studentUserId);
    if (!byUser.has(userId)) {
      byUser.set(userId, { userId, registrationNumber: enrollment.registrationNumber });
    }
  }
  const users = await User.find({ _id: { $in: [...byUser.keys()] } }).select('role departmentId');
  const valid = new Set(
    users
      .filter((user) => user.role === ROLES.STUDENT && String(user.departmentId) === String(offering.departmentId))
      .map((user) => String(user._id)),
  );
  return [...byUser.values()].filter((row) => valid.has(row.userId));
}

/**
 * Tell the offering's current-batch students about the CA notice (the repeat students who applied are notified
 * separately, per application, and are passed in `excludeUserIds`). Failures here never undo the published notice.
 * Returns the number of students notified.
 */
export async function notifyBatchStudents({
  type,
  notice,
  subject,
  offering,
  excludeUserIds = [],
  reason = '',
  withReminders = false,
  infrastructure,
}) {
  const excluded = new Set(excludeUserIds.map(String));
  let students;
  try {
    students = (await listOfferingStudents(offering)).filter((row) => !excluded.has(row.userId));
  } catch (error) {
    log.error('Could not list batch students for a CA notice', { noticeId: String(notice._id), message: error?.message });
    return 0;
  }
  const entries = [];
  for (const student of students) {
    const application = {
      studentUserId: student.userId,
      departmentId: notice.departmentId,
      registrationNumber: student.registrationNumber,
    };
    // Batch students have no subject link; this stands in for it so ids and guard references stay per student.
    const link = batchLink(student.userId);
    try {
      const { vars, templateParams } = buildCaMessage({ type, subject, notice, application, reason });
      await emitCaNotification({
        recipientUserId: student.userId,
        type,
        sourceId: noticeSourceId(notice, link),
        departmentId: notice.departmentId,
        infrastructure,
        vars,
        templateParams,
        actionPath: '/calendar',
        // A cancellation message must not be blocked by the cancellation it announces, so it is unguarded.
        guardRef: type === 'CA_EXAM_CANCELLED' ? undefined : guardRefFor(notice, link),
      });
      entries.push({ link, application, subject });
    } catch (error) {
      log.error('Could not notify a batch student about a CA notice', {
        noticeId: String(notice._id),
        studentUserId: student.userId,
        message: error?.message,
      });
    }
  }
  if (withReminders && entries.length) {
    try {
      await queueRemindersForLinks({ notice, entries, infrastructure });
    } catch (error) {
      log.error('Could not queue CA reminders for batch students', { noticeId: String(notice._id), message: error?.message });
    }
  }
  return entries.length;
}
