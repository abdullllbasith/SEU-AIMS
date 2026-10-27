/**
 * A missing mapping list means the offering has no specialization curriculum row.
 * Those offerings stay visible so existing manual offerings are not hidden.
 * A common mapping (no specialization) is visible to every student in the period.
 * Specialized mappings are visible only to a student who holds that specialization.
 */
export function offeringMatchesStudentSpecialization(studentSpecialization, mappings = []) {
  if (!mappings.length) {
    return true;
  }
  const specializations = mappings.map((mapping) => mapping?.specialization || null);
  if (specializations.includes(null)) {
    return true;
  }
  if (!studentSpecialization) {
    return false;
  }
  return specializations.includes(studentSpecialization);
}
