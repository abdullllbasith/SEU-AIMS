import { StudentAcademicContext } from '../models/student-academic-context.model.js';
import { LecturerAssignment } from '../models/lecturer-assignment.model.js';
import { SubjectOffering } from '../models/subject-offering.model.js';

export function findStudentByRegistrationNumber(registrationNumber) {
  return StudentAcademicContext.findOne({ registrationNumber: registrationNumber.toUpperCase() });
}

export function findStudentContextByUserId(userId) {
  return StudentAcademicContext.findOne({ userId });
}

export function findActiveAssignmentsForLecturer(lecturerUserId) {
  return LecturerAssignment.find({ lecturerUserId, isActive: true });
}

export function findAssignment(lecturerUserId, subjectOfferingId) {
  return LecturerAssignment.findOne({ lecturerUserId, subjectOfferingId, isActive: true });
}

export function findOfferingsForBatchSemester({ batchId, academicYearId, semesterId }) {
  return SubjectOffering.find({ batchId, academicYearId, semesterId });
}
