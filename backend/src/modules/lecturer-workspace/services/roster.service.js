import { ROLES } from '../../../shared/constants/roles.js';
import { User } from '../../authentication/index.js';
import {
  StudentAcademicContext,
  SubjectEnrollment,
  SubjectOffering,
  CurriculumMapping,
  offeringMatchesStudentSpecialization,
} from '../../academic-foundation/index.js';
import { requireAssignedOffering } from './offerings.service.js';

function id(value) {
  return value ? String(value._id || value) : null;
}

export async function listOfferingRoster(principal, offeringId) {
  const { item } = await requireAssignedOffering(principal, offeringId);
  const offering = await SubjectOffering.findById(item.id).select(
    'departmentId batchId academicYearId semesterId subjectId status',
  );
  if (!offering || String(offering.departmentId) !== String(item.departmentId)) {
    return { items: [] };
  }
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
    }).select('studentUserId registrationNumber enrollmentType'),
  ]);

  const byUser = new Map();
  for (const context of contexts) {
    if (!offeringMatchesStudentSpecialization(context.specialization, mappings)) {
      continue;
    }
    const userId = id(context.userId);
    byUser.set(userId, {
      studentUserId: userId,
      registrationNumber: context.registrationNumber,
      associations: ['CURRENT'],
      enrollmentType: null,
    });
  }
  for (const enrollment of enrollments) {
    const userId = id(enrollment.studentUserId);
    const existing = byUser.get(userId);
    if (existing) {
      if (!existing.associations.includes(enrollment.enrollmentType)) {
        existing.associations.push(enrollment.enrollmentType);
      }
      existing.enrollmentType = existing.enrollmentType || enrollment.enrollmentType;
      continue;
    }
    byUser.set(userId, {
      studentUserId: userId,
      registrationNumber: enrollment.registrationNumber,
      associations: [enrollment.enrollmentType],
      enrollmentType: enrollment.enrollmentType,
    });
  }

  const users = await User.find({ _id: { $in: [...byUser.keys()] } }).select('displayName role departmentId');
  const userById = new Map(users.map((user) => [String(user._id), user]));
  const items = [...byUser.values()]
    .filter((row) => {
      const user = userById.get(row.studentUserId);
      return user && user.role === ROLES.STUDENT && String(user.departmentId) === String(offering.departmentId);
    })
    .map((row) => ({
      ...row,
      displayName: userById.get(row.studentUserId)?.displayName || '',
    }))
    .sort((left, right) => left.registrationNumber.localeCompare(right.registrationNumber));

  return { items };
}
