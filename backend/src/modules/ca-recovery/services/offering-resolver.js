import { SubjectOffering, findActiveAssignmentsForOfferings } from '../../academic-foundation/index.js';

/**
 * Repeat candidates sit the CA with whichever offering of the subject is currently running, which is usually
 * a later batch than their own. Preference: offering with an active lecturer, then the student's own batch,
 * then the most recently created offering.
 */
export async function resolveActiveOfferingForSubject({ departmentId, subjectId, preferBatchId }) {
  const offerings = await SubjectOffering.find({ departmentId, subjectId, status: 'ACTIVE' });
  if (!offerings.length) {
    return null;
  }
  const assignments = await findActiveAssignmentsForOfferings(offerings.map((item) => item._id));
  const staffed = new Set(assignments.map((item) => String(item.subjectOfferingId)));
  const score = (offering) =>
    (staffed.has(String(offering._id)) ? 4 : 0) +
    (preferBatchId && String(offering.batchId) === String(preferBatchId) ? 2 : 0);
  const createdAt = (offering) => new Date(offering.createdAt || 0).getTime();
  return [...offerings].sort((a, b) => score(b) - score(a) || createdAt(b) - createdAt(a))[0];
}
