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
  SubjectOffering,
  LecturerAssignment,
  StudentAcademicContext,
  StudentAcademicHistory,
} from './models/index.js';
export {
  findStudentByRegistrationNumber,
  findStudentContextByUserId,
  findActiveAssignmentsForLecturer,
  findAssignment,
  findOfferingsForBatchSemester,
} from './repositories/academic-foundation.repository.js';
export { getMyContext, getMyOfferings } from './services/academic.service.js';
