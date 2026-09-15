import mongoose from 'mongoose';
import {
  LecturerAssignment,
  SubjectOffering,
  Batch,
  AcademicYear,
  Semester,
} from '../../academic-foundation/index.js';
import { OfficialResource } from '../../learning-environment/index.js';
import { User } from '../../authentication/index.js';
import { ForbiddenError, ValidationError } from '../../../shared/errors/app-error.js';
import { canManageAssignment } from './scope.js';
import { RESOURCE_PAGE_SIZE_DEFAULT, RESOURCE_PAGE_SIZE_MAX } from '../constants.js';

function id(value) {
  return value ? String(value._id || value) : null;
}

export async function lecturerStatusOf(principal) {
  const user = await User.findById(principal.userId).select('lecturerStatus accountStatus');
  return {
    lecturerStatus: user?.lecturerStatus || 'UNVERIFIED',
    accountStatus: user?.accountStatus || 'INACTIVE',
  };
}

export async function assignmentVersion(principal) {
  const rows = await LecturerAssignment.find({ lecturerUserId: principal.userId })
    .select('updatedAt isActive')
    .lean();
  if (!rows.length) {
    return 'none';
  }
  const latest = rows.reduce((max, row) => {
    const at = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
    return Math.max(max, at);
  }, 0);
  const active = rows.filter((row) => row.isActive !== false).length;
  return `${rows.length}:${active}:${latest}`;
}

export async function listAssignedOfferings(principal) {
  const { lecturerStatus } = await lecturerStatusOf(principal);
  const assignments = await LecturerAssignment.find({ lecturerUserId: principal.userId }).sort({
    assignedAt: -1,
  });
  const offeringIds = assignments.map((row) => row.subjectOfferingId);
  const offerings = await SubjectOffering.find({ _id: { $in: offeringIds } }).populate(
    'subjectId',
    'code name',
  );
  const offeringById = new Map(offerings.map((row) => [String(row._id), row]));
  const [batches, years, semesters] = await Promise.all([
    Batch.find({ _id: { $in: offerings.map((row) => row.batchId) } }).select('name code'),
    AcademicYear.find({ _id: { $in: offerings.map((row) => row.academicYearId) } }).select('name sequence'),
    Semester.find({ _id: { $in: offerings.map((row) => row.semesterId) } }).select('name sequence'),
  ]);
  const batchById = new Map(batches.map((row) => [String(row._id), row]));
  const yearById = new Map(years.map((row) => [String(row._id), row]));
  const semesterById = new Map(semesters.map((row) => [String(row._id), row]));

  const items = [];
  for (const assignment of assignments) {
    const offering = offeringById.get(String(assignment.subjectOfferingId));
    if (!offering) {
      continue;
    }
    const subject = offering.subjectId;
    const batch = batchById.get(id(offering.batchId));
    const year = yearById.get(id(offering.academicYearId));
    const semester = semesterById.get(id(offering.semesterId));
    const canManage = canManageAssignment({ assignment, offering, lecturerStatus });
    items.push({
      id: id(offering),
      assignmentId: id(assignment),
      isActiveAssignment: assignment.isActive !== false,
      canManage,
      status: offering.status,
      subjectId: subject && subject.code ? String(subject._id) : id(offering.subjectId),
      subjectCode: subject?.code || null,
      subjectName: subject?.name || null,
      batchId: id(offering.batchId),
      batchName: batch?.name || null,
      batchCode: batch?.code || null,
      academicYearId: id(offering.academicYearId),
      academicYearName: year?.name || null,
      semesterId: id(offering.semesterId),
      semesterName: semester?.name || null,
      departmentId: id(offering.departmentId),
      workspacePath: `/lecturer/offerings/${id(offering)}`,
      learningPath: `/learning/offerings/${id(offering)}`,
    });
  }
  return { items, lecturerStatus };
}

export async function requireAssignedOffering(principal, offeringId, { manage = false } = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(offeringId || ''))) {
    throw new ValidationError('A valid subject offering is required');
  }
  const { items, lecturerStatus } = await listAssignedOfferings(principal);
  const item = items.find((row) => row.id === String(offeringId));
  if (!item) {
    throw new ForbiddenError('Forbidden');
  }
  if (manage && !item.canManage) {
    throw new ForbiddenError('This assignment is not currently authorized for management');
  }
  return { item, lecturerStatus };
}

export async function resourceCountsByOffering(offeringIds) {
  const counts = new Map();
  if (!offeringIds.length) {
    return counts;
  }
  const objectIds = offeringIds.map((value) => new mongoose.Types.ObjectId(value));
  const rows = await OfficialResource.aggregate([
    {
      $match: {
        subjectOfferingId: { $in: objectIds },
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      },
    },
    {
      $group: {
        _id: { offering: '$subjectOfferingId', state: '$publicationState' },
        count: { $sum: 1 },
      },
    },
  ]);
  for (const row of rows) {
    const offeringId = String(row._id.offering);
    const current = counts.get(offeringId) || { published: 0, unpublished: 0, pendingProcessing: 0 };
    if (row._id.state === 'PUBLISHED') {
      current.published += row.count;
    } else {
      current.unpublished += row.count;
    }
    counts.set(offeringId, current);
  }
  return counts;
}

export async function listResourcesForOffering(offeringId, query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(
    RESOURCE_PAGE_SIZE_MAX,
    Math.max(1, Number.parseInt(query.pageSize, 10) || RESOURCE_PAGE_SIZE_DEFAULT),
  );
  const filter = {
    subjectOfferingId: offeringId,
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
  };
  if (query.publicationState && ['DRAFT', 'PUBLISHED', 'UNPUBLISHED'].includes(String(query.publicationState))) {
    filter.publicationState = String(query.publicationState);
  }
  const skip = (page - 1) * pageSize;
  const [docs, total] = await Promise.all([
    OfficialResource.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(pageSize).lean(),
    OfficialResource.countDocuments(filter),
  ]);
  return {
    items: docs.map((doc) => ({
      id: String(doc._id),
      title: doc.title,
      publicationState: doc.publicationState,
      category: doc.category,
      version: doc.version,
      publishedAt: doc.publishedAt || null,
      updatedAt: doc.updatedAt,
      learningPath: `/learning/offerings/${offeringId}`,
    })),
    total,
    page,
    pageSize,
  };
}
