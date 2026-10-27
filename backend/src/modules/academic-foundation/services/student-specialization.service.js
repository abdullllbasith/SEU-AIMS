import { CurriculumMapping } from '../models/curriculum-mapping.model.js';
import { offeringMatchesStudentSpecialization } from '../policies/specialization.policies.js';

function subjectIdOf(offering) {
  return String(offering.subjectId?._id || offering.subjectId);
}

export async function filterOfferingsForSpecialization(offerings, specializationFor) {
  if (!offerings.length) {
    return [];
  }
  const mappings = await CurriculumMapping.find({
    departmentId: { $in: [...new Set(offerings.map((offering) => String(offering.departmentId)))] },
    status: 'ACTIVE',
    subjectId: { $in: offerings.map(subjectIdOf) },
  }).select('departmentId subjectId academicYearId semesterId specialization');
  return offerings.filter((offering) => {
    const subjectId = subjectIdOf(offering);
    const related = mappings.filter(
      (mapping) =>
        String(mapping.departmentId) === String(offering.departmentId) &&
        String(mapping.subjectId) === subjectId &&
        String(mapping.academicYearId) === String(offering.academicYearId) &&
        String(mapping.semesterId) === String(offering.semesterId),
    );
    const specialization = typeof specializationFor === 'function' ? specializationFor(offering) : specializationFor;
    return offeringMatchesStudentSpecialization(specialization, related);
  });
}

export async function mappingsForOffering(offering) {
  return CurriculumMapping.find({
    departmentId: offering.departmentId,
    subjectId: subjectIdOf(offering),
    academicYearId: offering.academicYearId,
    semesterId: offering.semesterId,
    status: 'ACTIVE',
  }).select('specialization');
}
