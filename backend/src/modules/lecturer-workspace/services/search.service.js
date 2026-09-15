import mongoose from 'mongoose';
import { OfficialResource, ResourceSection } from '../../learning-environment/index.js';
import { CalendarEvent } from '../../notices-calendar/index.js';
import { assertLecturer, prefixRegex, sanitizeWorkspaceSearch } from './scope.js';
import { listAssignedOfferings } from './offerings.service.js';
import { listApprovedForLecturer } from '../../ca-recovery/index.js';

export async function searchLecturerWorkspace(principal, query = {}) {
  assertLecturer(principal);
  const q = sanitizeWorkspaceSearch(query.q);
  if (!q) {
    return {
      q,
      offerings: [],
      resources: [],
      events: [],
      caStudents: [],
      notes: 'Enter a subject code, resource title, event title, or CA registration number. Search stays inside your assignments.',
    };
  }
  const { items } = await listAssignedOfferings(principal);
  const pattern = prefixRegex(q);
  const offeringHits = items.filter(
    (item) => pattern.test(item.subjectCode || '') || pattern.test(item.subjectName || ''),
  );
  const objectIds = items.map((item) => new mongoose.Types.ObjectId(item.id));
  const resourceDocs = objectIds.length
    ? await OfficialResource.find({
        subjectOfferingId: { $in: objectIds },
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
        title: pattern,
      })
        .limit(20)
        .lean()
    : [];
  const sectionHits = objectIds.length
    ? await ResourceSection.find({
        subjectOfferingId: { $in: objectIds },
        name: pattern,
      })
        .limit(10)
        .lean()
    : [];
  const events = objectIds.length
    ? await CalendarEvent.find({
        subjectOfferingId: { $in: objectIds },
        cancelledAt: null,
        title: pattern,
      })
        .limit(20)
        .lean()
    : [];
  let caStudents = [];
  try {
    const eligible = await listApprovedForLecturer(principal);
    caStudents = eligible.items
      .filter((row) => pattern.test(row.registrationNumber || '') || pattern.test(row.applicationId || ''))
      .slice(0, 20)
      .map((row) => ({
        applicationId: row.applicationId,
        registrationNumber: row.registrationNumber,
        workflowStatus: row.workflowStatus,
        subjectOfferingId: row.subjectOfferingId,
        caPath: '/lecturer/ca',
      }));
  } catch {
    caStudents = [];
  }

  const offeringById = new Map(items.map((item) => [item.id, item]));
  return {
    q,
    offerings: offeringHits.slice(0, 20).map((item) => ({
      id: item.id,
      subjectCode: item.subjectCode,
      subjectName: item.subjectName,
      canManage: item.canManage,
      workspacePath: item.workspacePath,
    })),
    resources: resourceDocs.map((doc) => ({
      id: String(doc._id),
      title: doc.title,
      publicationState: doc.publicationState,
      subjectCode: offeringById.get(String(doc.subjectOfferingId))?.subjectCode || null,
      learningPath: `/learning/offerings/${doc.subjectOfferingId}`,
    })),
    sections: sectionHits.map((doc) => ({
      id: String(doc._id),
      name: doc.name,
      offeringId: String(doc.subjectOfferingId),
      learningPath: `/learning/offerings/${doc.subjectOfferingId}`,
    })),
    events: events.map((doc) => ({
      id: String(doc._id),
      title: doc.title,
      startsAt: doc.startsAt,
      eventType: doc.eventType,
      calendarPath: '/calendar',
    })),
    caStudents,
    notes: 'Assigned offerings only. Study Room, GPA, and full result sets are not searched. Students appear only as CA registration numbers you are allowed to schedule.',
  };
}
