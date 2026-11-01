import { listAccessibleOfferings } from '../../learning-environment/index.js';
import { conceal, requireObjectId } from '../utils/http.js';
import { requireAgentStudent } from './access.service.js';

/** Current-semester subjects (plus active repeat/arrear enrolments), exactly as Learning Resources shows them. */
export async function listSubjects(principal) {
  await requireAgentStudent(principal);
  const { items } = await listAccessibleOfferings(principal, {});
  return items.map((item) => ({
    offeringId: item.id,
    subjectCode: item.subjectCode,
    subjectName: item.subjectName,
  }));
}

/** Re-checked on every request, so a student whose semester changed loses access to old offerings. */
export async function requireAccessibleOffering(principal, offeringId) {
  requireObjectId(offeringId, 'subject');
  const subjects = await listSubjects(principal);
  const match = subjects.find((item) => item.offeringId === String(offeringId));
  if (!match) {
    throw conceal('Subject');
  }
  return match;
}
