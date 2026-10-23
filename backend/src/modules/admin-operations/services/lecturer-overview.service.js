import { User } from '../../authentication/index.js';
import { LecturerAssignment, SubjectOffering, Subject } from '../../academic-foundation/index.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { containsRegex, departmentObjectId, parseObjectId, parsePage, sanitizeSearch } from './scope.js';

export async function listLecturers(principal, query = {}) {
  const departmentId = departmentObjectId(principal);
  const { page, pageSize } = parsePage(query);
  const q = sanitizeSearch(query.q);
  const filter = { departmentId, role: ROLES.LECTURER };
  if (q) {
    filter.displayName = containsRegex(q);
  }
  if (query.accountStatus) {
    const allowed = ['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'];
    if (!allowed.includes(query.accountStatus)) {
      throw new ValidationError('Invalid accountStatus');
    }
    filter.accountStatus = query.accountStatus;
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('displayName email accountStatus lecturerStatus')
      .sort({ displayName: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    User.countDocuments(filter),
  ]);
  const ids = users.map((user) => user._id);
  const assignmentCounts = await LecturerAssignment.aggregate([
    { $match: { departmentId, lecturerUserId: { $in: ids }, isActive: true } },
    { $group: { _id: '$lecturerUserId', count: { $sum: 1 } } },
  ]);
  const countByLecturer = new Map(assignmentCounts.map((row) => [String(row._id), row.count]));

  return {
    page,
    pageSize,
    total,
    items: users.map((user) => ({
      userId: String(user._id),
      displayName: user.displayName || '',
      email: user.email,
      accountStatus: user.accountStatus,
      lecturerStatus: user.lecturerStatus,
      activeAssignmentCount: countByLecturer.get(String(user._id)) || 0,
    })),
    notes: ['Assignment count is stored LecturerAssignment rows. No workload policy is applied.'],
  };
}

export async function getLecturerDetail(principal, userIdParam) {
  const departmentId = departmentObjectId(principal);
  const userId = parseObjectId(userIdParam, 'userId');
  if (!userId) {
    throw new ValidationError('Invalid userId');
  }
  const user = await User.findOne({ _id: userId, departmentId, role: ROLES.LECTURER }).select(
    'displayName email accountStatus lecturerStatus',
  );
  if (!user) {
    throw new NotFoundError('Lecturer not found');
  }
  const assignments = await LecturerAssignment.find({ departmentId, lecturerUserId: userId })
    .sort({ assignedAt: -1 })
    .lean();
  const offeringIds = assignments.map((row) => row.subjectOfferingId);
  const offerings = await SubjectOffering.find({ _id: { $in: offeringIds }, departmentId }).lean();
  const subjects = await Subject.find({
    _id: { $in: offerings.map((row) => row.subjectId) },
    departmentId,
  })
    .select('code name')
    .lean();
  const offeringById = new Map(offerings.map((row) => [String(row._id), row]));
  const subjectById = new Map(subjects.map((row) => [String(row._id), row]));

  return {
    userId: String(user._id),
    displayName: user.displayName || '',
    email: user.email,
    accountStatus: user.accountStatus,
    lecturerStatus: user.lecturerStatus,
    assignments: assignments.map((row) => {
      const offering = offeringById.get(String(row.subjectOfferingId));
      const subject = offering ? subjectById.get(String(offering.subjectId)) : null;
      return {
        assignmentId: String(row._id),
        subjectOfferingId: String(row.subjectOfferingId),
        subjectCode: subject?.code || null,
        subjectName: subject?.name || null,
        isActive: row.isActive,
        assignedAt: row.assignedAt,
        revokedAt: row.revokedAt || null,
      };
    }),
    notes: ['Inactive assignments remain visible. Changes are made on academic-foundation routes.'],
  };
}
