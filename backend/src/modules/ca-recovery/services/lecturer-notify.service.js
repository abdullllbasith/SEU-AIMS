import { Subject, SubjectOffering, findActiveAssignmentsForOfferings } from '../../academic-foundation/index.js';
import { User } from '../../authentication/models/user.model.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { emitCaNotification } from './notify.js';
import { buildCaMessage } from './exam-messages.js';

/**
 * After an application is approved, tell the active lecturer(s) of each affected Subject Offering.
 * Idempotency is per application, offering and lecturer, so a lecturer who handles two of the student's
 * subjects gets two notifications and a repeated approval call creates no duplicates.
 * Lecturers are notified in-app and by email (WhatsApp is only used for the student exam messages).
 */
export async function notifyLecturersOfApproval({ application, links, infrastructure }) {
  const offeringIds = [...new Set(links.map((link) => String(link.subjectOfferingId || '')).filter(Boolean))];
  if (!offeringIds.length) {
    return { notified: 0 };
  }
  const offerings = await SubjectOffering.find({
    _id: { $in: offeringIds },
    status: 'ACTIVE',
    departmentId: application.departmentId,
  });
  const assignments = await findActiveAssignmentsForOfferings(offerings.map((offering) => offering._id));
  const lecturers = await User.find({
    _id: { $in: [...new Set(assignments.map((item) => String(item.lecturerUserId)))] },
    role: ROLES.LECTURER,
    accountStatus: 'ACTIVE',
    lecturerStatus: 'VERIFIED',
    departmentId: application.departmentId,
  }).select('_id');
  const activeLecturerIds = new Set(lecturers.map((lecturer) => String(lecturer._id)));
  const subjects = await Subject.find({ _id: { $in: offerings.map((offering) => offering.subjectId) } });
  const subjectById = new Map(subjects.map((subject) => [String(subject._id), subject]));

  let notified = 0;
  for (const offering of offerings) {
    const subject = subjectById.get(String(offering.subjectId));
    const { vars } = buildCaMessage({ type: 'CA_LECTURER_APPROVED_STUDENT', subject, application });
    for (const assignment of assignments.filter(
      (item) => String(item.subjectOfferingId) === String(offering._id),
    )) {
      if (!activeLecturerIds.has(String(assignment.lecturerUserId))) {
        continue;
      }
      await emitCaNotification({
        recipientUserId: assignment.lecturerUserId,
        type: 'CA_LECTURER_APPROVED_STUDENT',
        sourceId: `${application.applicationId}:${offering._id}:${assignment.lecturerUserId}`,
        departmentId: application.departmentId,
        infrastructure,
        vars,
        actionPath: '/lecturer/ca',
        channels: ['IN_APP', 'EMAIL'],
      });
      notified += 1;
    }
  }
  return { notified };
}
