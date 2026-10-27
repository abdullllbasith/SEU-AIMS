import { LecturerAssignment, SubjectOffering, Subject, Batch, AcademicYear, Semester } from '../../academic-foundation/index.js';
import { OfficialResource } from '../../learning-environment/index.js';
import { CalendarEvent } from '../../notices-calendar/index.js';
import { departmentObjectId, parseObjectId, parsePage } from './scope.js';

export async function listOfferingHealth(principal, query = {}) {
  const departmentId = departmentObjectId(principal);
  const { page, pageSize } = parsePage(query);
  const filter = { departmentId };
  const semesterId = parseObjectId(query.semesterId, 'semesterId');
  const academicYearId = parseObjectId(query.academicYearId, 'academicYearId');
  const batchId = parseObjectId(query.batchId, 'batchId');
  const subjectId = parseObjectId(query.subjectId, 'subjectId');
  if (semesterId) {
    filter.semesterId = semesterId;
  }
  if (academicYearId) {
    filter.academicYearId = academicYearId;
  }
  if (batchId) {
    filter.batchId = batchId;
  }
  if (subjectId) {
    filter.subjectId = subjectId;
  }
  if (query.status === 'ACTIVE' || query.status === 'ARCHIVED') {
    filter.status = query.status;
  }

  const [offerings, total] = await Promise.all([
    SubjectOffering.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    SubjectOffering.countDocuments(filter),
  ]);
  const offeringIds = offerings.map((row) => row._id);
  const now = new Date();
  const [subjects, batches, years, semesters, assignments, resources, upcoming] = await Promise.all([
    Subject.find({ departmentId }).select('code name').lean(),
    Batch.find({ departmentId }).select('code').lean(),
    AcademicYear.find({ departmentId }).select('name').lean(),
    Semester.find({ departmentId }).select('name').lean(),
    LecturerAssignment.find({ departmentId, subjectOfferingId: { $in: offeringIds } }).lean(),
    OfficialResource.aggregate([
      {
        $match: {
          departmentId,
          subjectOfferingId: { $in: offeringIds },
          deletedAt: null,
        },
      },
      {
        $group: {
          _id: { offering: '$subjectOfferingId', state: '$publicationState' },
          count: { $sum: 1 },
        },
      },
    ]),
    CalendarEvent.aggregate([
      {
        $match: {
          departmentId,
          subjectOfferingId: { $in: offeringIds },
          cancelledAt: null,
          startsAt: { $gte: now },
        },
      },
      { $group: { _id: '$subjectOfferingId', count: { $sum: 1 } } },
    ]),
  ]);

  const subjectById = new Map(subjects.map((item) => [String(item._id), item]));
  const batchById = new Map(batches.map((item) => [String(item._id), item]));
  const yearById = new Map(years.map((item) => [String(item._id), item]));
  const semById = new Map(semesters.map((item) => [String(item._id), item]));
  const lecturersByOffering = new Map();
  for (const row of assignments) {
    const key = String(row.subjectOfferingId);
    if (!lecturersByOffering.has(key)) {
      lecturersByOffering.set(key, { active: 0, inactive: 0 });
    }
    const bucket = lecturersByOffering.get(key);
    if (row.isActive) {
      bucket.active += 1;
    } else {
      bucket.inactive += 1;
    }
  }
  const resourceByOffering = new Map();
  for (const row of resources) {
    const key = String(row._id.offering);
    if (!resourceByOffering.has(key)) {
      resourceByOffering.set(key, { published: 0, unpublished: 0 });
    }
    const bucket = resourceByOffering.get(key);
    if (row._id.state === 'PUBLISHED') {
      bucket.published += row.count;
    } else {
      bucket.unpublished += row.count;
    }
  }
  const upcomingByOffering = new Map(upcoming.map((row) => [String(row._id), row.count]));

  const items = offerings.map((offering) => {
    const id = String(offering._id);
    const lecturers = lecturersByOffering.get(id) || { active: 0, inactive: 0 };
    const resourcesCounts = resourceByOffering.get(id) || { published: 0, unpublished: 0 };
    return {
      subjectOfferingId: id,
      subjectCode: subjectById.get(String(offering.subjectId))?.code || null,
      subjectName: subjectById.get(String(offering.subjectId))?.name || null,
      batchCode: batchById.get(String(offering.batchId))?.code || null,
      academicYear: yearById.get(String(offering.academicYearId))?.name || null,
      semester: semById.get(String(offering.semesterId))?.name || null,
      status: offering.status,
      activeLecturerCount: lecturers.active,
      inactiveLecturerCount: lecturers.inactive,
      unassigned: lecturers.active === 0,
      multipleLecturers: lecturers.active > 1,
      publishedOfficialResources: resourcesCounts.published,
      unpublishedOfficialResources: resourcesCounts.unpublished,
      upcomingCalendarItems: upcomingByOffering.get(id) || 0,
    };
  });

  const filtered =
    query.unassigned === 'true' ? items.filter((row) => row.unassigned) : items;

  return {
    page,
    pageSize,
    total,
    items: filtered,
    notes: [
      'unassigned and multipleLecturers are counts, not policy judgments.',
      'Study Room files are not listed here.',
    ],
  };
}
