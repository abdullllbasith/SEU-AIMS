import { CaApplication } from '../models/ca-application.model.js';
import { CaApplicationSubject } from '../models/ca-application-subject.model.js';
import { CaApplicationEvent } from '../models/ca-application-event.model.js';
import { APPLICATION_TRANSITIONS } from './transitions.js';

const DERIVABLE = ['APPROVED', 'SCHEDULED', 'COMPLETED'];

/** Pure derivation of the application status from its subject exam states. */
export function deriveApplicationStatus(examStatuses) {
  if (!examStatuses.length) {
    return null;
  }
  if (examStatuses.every((status) => status === 'RESOLVED')) {
    return 'RESOLVED';
  }
  const open = examStatuses.filter((status) => status !== 'RESOLVED');
  if (open.every((status) => status === 'COMPLETED')) {
    return 'COMPLETED';
  }
  if (open.some((status) => status === 'SCHEDULED' || status === 'COMPLETED')) {
    return 'SCHEDULED';
  }
  return 'APPROVED';
}

/**
 * Recalculate CaApplication.workflowStatus from all linked subjects. Applies only once the application is
 * APPROVED or later. Uses a conditional write on the previous status and recalculates on conflict.
 */
export async function syncApplicationStatusFromSubjects(applicationId, { actorUserId, linkId, reason = '' } = {}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const application = await CaApplication.findById(applicationId);
    if (!application || !DERIVABLE.includes(application.workflowStatus)) {
      return { changed: false, workflowStatus: application?.workflowStatus };
    }
    const links = await CaApplicationSubject.find({ applicationId: application._id }).select('examStatus');
    const next = deriveApplicationStatus(links.map((link) => link.examStatus));
    const current = application.workflowStatus;
    if (!next || next === current) {
      return { changed: false, workflowStatus: current };
    }
    if (!(APPLICATION_TRANSITIONS[current] || []).includes(next)) {
      return { changed: false, workflowStatus: current };
    }
    const updated = await CaApplication.findOneAndUpdate(
      { _id: application._id, workflowStatus: current },
      { $set: { workflowStatus: next } },
      { new: true },
    );
    if (!updated) {
      continue;
    }
    await CaApplicationEvent.create({
      applicationId: application._id,
      type: 'SUBJECT_STATUS_DERIVED',
      actorUserId: actorUserId || application.decidedByUserId || application.studentUserId,
      fromStatus: current,
      toStatus: next,
      reason: reason || (linkId ? `Subject ${linkId}` : ''),
      occurredAt: new Date(),
    });
    return { changed: true, workflowStatus: next };
  }
  return { changed: false, workflowStatus: undefined, conflict: true };
}
