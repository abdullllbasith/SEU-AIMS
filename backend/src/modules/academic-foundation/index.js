/**
 * Public API for the academic-foundation module.
 * Other modules must import from this file only.
 */
import { createRouter } from './routes/index.js';

export const MODULE_ID = 'academic-foundation';
export const API_PREFIX = '/api/academic';

export function createAcademicFoundationModule(_deps = {}) {
  const router = createRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
  };
}

export { createRouter };
export {
  Department,
  Batch,
  AcademicYear,
  Semester,
  Subject,
  CurriculumMapping,
  SubjectOffering,
  OfferingAssessmentConfig,
  LecturerAssignment,
  StudentAcademicContext,
  StudentAcademicHistory,
  SubjectEnrollment,
} from './models/index.js';
export {
  findStudentByRegistrationNumber,
  findStudentContextByUserId,
  findActiveAssignmentsForLecturer,
  findActiveAssignmentsForOfferings,
  findAssignment,
  findOfferingsForBatchSemester,
} from './repositories/academic-foundation.repository.js';
export { isOfferingInStudentCurrentContext } from './policies/academic.policies.js';
export { offeringMatchesStudentSpecialization } from './policies/specialization.policies.js';
export { filterOfferingsForSpecialization, mappingsForOffering } from './services/student-specialization.service.js';
export {
  getAssessmentScheme,
  listSchemeCodes,
  validateAssessmentComponents,
  COMPONENT_PASS_MARKS,
  SCHEME_STATUSES,
} from './services/assessment-schemes.js';
export { getMyContext, getMyOfferings } from './services/academic.service.js';
