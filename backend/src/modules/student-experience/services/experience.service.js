import mongoose from 'mongoose';
import { ROLES } from '../../../shared/constants/roles.js';
import { ForbiddenError, ValidationError } from '../../../shared/errors/app-error.js';
import {
  AcademicYear,
  getMyContext,
  getMyOfferings,
  LecturerAssignment,
  Semester,
  Subject,
} from '../../academic-foundation/index.js';
import { getOwnResults } from '../../results/index.js';
import { getStudentGpaSummary, GpaSnapshot } from '../../gpa-cgpa/index.js';
import { listNotices, upcomingEvents } from '../../notices-calendar/index.js';
import { listInbox, unreadCount } from '../../notifications/index.js';
import {
  listOwnApplications,
  listEligibleConditions,
  IncompleteCa,
  CaSchedule,
} from '../../ca-recovery/index.js';
import { OfficialResource, listAccessibleOfferings, isStudentVisibleResource } from '../../learning-environment/index.js';
import { StoredFile } from '../../files/index.js';
import { User } from '../../authentication/index.js';
import { presentGpaSummary } from '../utils/gpa-presentation.js';
import { dashboardCacheKey, getDashboardCache, setDashboardCache } from './dashboard-cache.js';
import { getOwnProfile } from './profile.service.js';
import {
  buildAttentionItems,
  groupUpcomingEvents,
  prefixRegex,
  publicSection,
  sanitizeWorkspaceSearch,
} from './workspace.js';

function assertStudent(principal) {
  if (!principal || principal.role !== ROLES.STUDENT) {
    throw new ForbiddenError('Forbidden');
  }
}

async function settle(label, fn) {
  try {
    return { ok: true, data: await fn() };
  } catch {
    return { ok: false, error: `${label} is temporarily unavailable.` };
  }
}

async function caSummary(principal) {
  const open = await IncompleteCa.find({
    studentUserId: principal.userId,
    status: { $in: ['OPEN', 'IN_APPLICATION'] },
  }).select('subjectCode status');
  const applications = await listOwnApplications(principal);
  const latest = applications.items[0] || null;
  let upcomingSchedule = null;
  if (latest && ['APPROVED', 'SCHEDULED'].includes(latest.workflowStatus)) {
    const schedule = await CaSchedule.findOne({
      applicationId: latest.id,
      cancelledAt: null,
    }).sort({ scheduledAt: 1 });
    if (schedule) {
      upcomingSchedule = {
        scheduledAt: schedule.scheduledAt,
        venue: schedule.venue || '',
      };
    }
  }
  const eligible = await listEligibleConditions(principal).catch(() => ({ window: null }));
  return {
    unresolvedConditions: open.map((item) => ({
      subjectCode: item.subjectCode,
      status: item.status,
    })),
    application: latest
      ? {
          applicationId: latest.applicationId,
          workflowStatus: latest.workflowStatus,
          physicalVerificationStatus: latest.physicalVerificationStatus,
        }
      : null,
    upcomingSchedule,
    window: eligible.window
      ? {
          lifecycle: eligible.window.lifecycle,
          closesAt: eligible.window.closesAt,
        }
      : null,
    caPath: '/ca',
  };
}

async function publishedResourcesForOfferings(offerings) {
  const offeringIds = offerings.map((item) => item.id).filter(Boolean);
  if (!offeringIds.length) {
    return { latestResources: [], countByOffering: new Map() };
  }
  const objectIds = offeringIds.map((id) => new mongoose.Types.ObjectId(id));
  const docs = await OfficialResource.find({
    subjectOfferingId: { $in: objectIds },
    publicationState: 'PUBLISHED',
    $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
  })
    .sort({ publishedAt: -1 })
    .limit(40)
    .lean();
  const files = await StoredFile.find({ _id: { $in: docs.map((item) => item.fileId) } }).lean();
  const fileById = new Map(files.map((file) => [String(file._id), file]));
  const offeringById = new Map(offerings.map((item) => [String(item.id), item]));
  const visible = [];
  const countByOffering = new Map();
  for (const doc of docs) {
    const file = fileById.get(String(doc.fileId));
    if (!isStudentVisibleResource(doc, file)) {
      continue;
    }
    const offeringId = String(doc.subjectOfferingId);
    countByOffering.set(offeringId, (countByOffering.get(offeringId) || 0) + 1);
    const offering = offeringById.get(offeringId);
    visible.push({
      id: String(doc._id),
      title: doc.title,
      offeringId,
      subjectCode: offering?.subjectCode || null,
      publishedAt: doc.publishedAt || null,
      version: doc.version,
      mimeType: file?.mimeType || null,
      sizeBytes: file?.sizeBytes || null,
      learningPath: `/learning/offerings/${offeringId}`,
    });
  }
  return { latestResources: visible.slice(0, 8), countByOffering };
}

async function resourceSummary(principal, offerings) {
  const published = await publishedResourcesForOfferings(offerings);
  return {
    offerings: offerings.map((item) => ({
      id: item.id,
      subjectCode: item.subjectCode,
      subjectName: item.subjectName,
    })),
    latestResources: published.latestResources,
    countByOffering: published.countByOffering,
  };
}

async function lecturerNames(offeringIds) {
  const assignments = await LecturerAssignment.find({
    subjectOfferingId: { $in: offeringIds },
    isActive: true,
  }).select('lecturerUserId subjectOfferingId');
  const users = await User.find({ _id: { $in: assignments.map((item) => item.lecturerUserId) } }).select(
    'displayName',
  );
  const byId = new Map(users.map((item) => [String(item._id), item.displayName || '']));
  const names = new Map();
  for (const row of assignments) {
    const key = String(row.subjectOfferingId);
    const list = names.get(key) || [];
    list.push(byId.get(String(row.lecturerUserId)) || 'Lecturer');
    names.set(key, list);
  }
  return names;
}

export async function getStudentDashboard(principal, { refresh = false } = {}) {
  assertStudent(principal);
  const contextBundle = await getMyContext(principal).catch(() => null);
  const gpaSnap = await GpaSnapshot.findOne({ studentUserId: principal.userId, scope: 'CUMULATIVE' }).select(
    'updatedAt',
  );
  const key = dashboardCacheKey({
    userId: principal.userId,
    contextVersion: contextBundle?.context?.updatedAt || 'none',
    gpaVersion: gpaSnap?.updatedAt || 'none',
  });
  if (!refresh) {
    const cached = getDashboardCache(key);
    if (cached) {
      return { ...cached, cache: { hit: true } };
    }
  }

  const offeringsResult = await getMyOfferings(principal).catch(() => ({ items: [] }));
  const offeringItems = offeringsResult.items;
  const lecturers = await lecturerNames(offeringItems.map((item) => item.id));
  const subjects = await Subject.find({
    code: { $in: offeringItems.map((item) => item.subjectCode).filter(Boolean) },
  }).select('code credits');
  const creditsByCode = new Map(subjects.map((item) => [item.code, item.credits]));
  const [
    profile,
    notices,
    events,
    unread,
    inbox,
    results,
    gpaRaw,
    ca,
    learning,
  ] = await Promise.all([
    settle('Profile', () => getOwnProfile(principal)),
    settle('Notices', () => listNotices(principal, { pageSize: 5 })),
    settle('Calendar', () => upcomingEvents(principal)),
    settle('Notifications', () => unreadCount(principal)),
    settle('Notifications', () => listInbox(principal, { pageSize: 5 })),
    settle('Results', () => getOwnResults(principal)),
    settle('GPA', () => getStudentGpaSummary(principal.userId)),
    settle('CA recovery', () => caSummary(principal)),
    settle('Learning', () => resourceSummary(principal, offeringItems)),
  ]);

  const eventItems = events.ok ? events.data.items : [];
  const noticeItems = notices.ok ? notices.data.items : [];
  const inboxItems = inbox.ok ? inbox.data.items : [];
  const latestResources = learning.ok ? learning.data.latestResources : [];
  const counts = learning.ok ? learning.data.countByOffering : new Map();
  const now = new Date();
  const currentSubjects = offeringItems.map((item) => {
    const related = eventItems
      .filter((event) => String(event.subjectOfferingId || '') === String(item.id))
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    return {
      id: item.id,
      subjectCode: item.subjectCode,
      subjectName: item.subjectName,
      credits: creditsByCode.get(item.subjectCode) ?? null,
      lecturers: lecturers.get(item.id) || [],
      publishedResourceCount: counts.get(String(item.id)) || 0,
      nextEvent: related[0]
        ? { title: related[0].title, startsAt: related[0].startsAt }
        : null,
      learningPath: `/learning/offerings/${item.id}`,
    };
  });

  const attention = buildAttentionItems({
    caRecovery: ca.ok ? ca.data : null,
    windowLifecycle: ca.ok ? ca.data.window?.lifecycle : null,
    upcomingEvents: eventItems,
    notices: noticeItems,
    notifications: inboxItems,
    recentResources: latestResources,
    now,
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    student: profile.ok ? { displayName: profile.data.displayName, email: profile.data.email } : null,
    academicContext: contextBundle
      ? {
          registrationNumber: contextBundle.context.registrationNumber,
          departmentId: contextBundle.context.departmentId,
          batchId: contextBundle.context.batchId,
          academicYearId: contextBundle.context.currentAcademicYearId,
          semesterId: contextBundle.context.currentSemesterId,
          status: contextBundle.context.status,
        }
      : null,
    attention,
    deadlineGroups: groupUpcomingEvents(eventItems, now),
    currentSubjects,
    notices: noticeItems,
    upcomingEvents: eventItems,
    notifications: {
      unreadCount: unread.ok ? unread.data.count : null,
      recent: inboxItems,
    },
    performance: gpaRaw.ok ? presentGpaSummary(gpaRaw.data) : { available: false, gpa: null, cgpa: null },
    results: results.ok
      ? {
          current: results.data.current,
          eca: results.data.current.filter((item) => item.isEca),
        }
      : null,
    caRecovery: ca.ok ? ca.data : null,
    resources: learning.ok
      ? { offerings: learning.data.offerings, latestResources }
      : null,
    shortcuts: {
      history: '/academic/history',
      studyRoom: '/study-room',
      learning: '/learning',
      results: '/results/me',
      ca: '/ca',
      search: '/search',
    },
    sections: {
      profile: publicSection(profile),
      notices: publicSection(notices),
      calendar: publicSection(events),
      notifications:
        unread.ok && inbox.ok
          ? { ok: true }
          : { ok: false, error: 'Notifications are temporarily unavailable.' },
      results: publicSection(results),
      gpa: publicSection(gpaRaw),
      ca: publicSection(ca),
      learning: publicSection(learning),
    },
    cache: { hit: false, ttlMs: 15_000, note: 'Student-scoped in-process cache. Refresh with ?refresh=true.' },
  };
  setDashboardCache(key, payload);
  return payload;
}

export async function getAcademicHistory(principal, query = {}) {
  assertStudent(principal);
  if (query.studentId && String(query.studentId) !== String(principal.userId)) {
    throw new ForbiddenError('Forbidden');
  }
  const contextBundle = await getMyContext(principal);
  const results = await getOwnResults(principal);
  const offeringsHistory = await listAccessibleOfferings(principal, { scope: 'history' });
  const semesterId = query.semesterId ? String(query.semesterId) : null;
  const filtered = semesterId
    ? results.all.filter((item) => String(item.semesterId) === semesterId)
    : results.all;
  return {
    current: contextBundle.context,
    history: contextBundle.history,
    results: filtered,
    offerings: offeringsHistory.items,
  };
}

export async function getPerformance(principal, query = {}) {
  assertStudent(principal);
  if (query.studentId && String(query.studentId) !== String(principal.userId)) {
    throw new ForbiddenError('Forbidden');
  }
  const results = await getOwnResults(principal);
  const gpa = presentGpaSummary(await getStudentGpaSummary(principal.userId));
  const distribution = {};
  for (const row of results.all) {
    const key = row.isEca ? 'E(CA)' : row.resultCode;
    distribution[key] = (distribution[key] || 0) + 1;
  }
  const subjects = await Subject.find({ code: { $in: results.all.map((item) => item.subjectCode) } }).select(
    'code name credits',
  );
  const byCode = new Map(subjects.map((item) => [item.code, item]));
  const trendSource = gpa.available ? gpa.semesters : [];
  const yearIds = [
    ...new Set(
      [...trendSource, ...results.all]
        .map((item) => item.academicYearId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const semesterIds = [
    ...new Set(
      [...trendSource, ...results.all]
        .map((item) => item.semesterId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const [years, semesters] = await Promise.all([
    yearIds.length
      ? AcademicYear.find({ _id: { $in: yearIds } })
          .select('name sequence')
          .lean()
      : [],
    semesterIds.length
      ? Semester.find({ _id: { $in: semesterIds } })
          .select('name sequence academicYearId')
          .lean()
      : [],
  ]);
  const yearById = new Map(years.map((row) => [String(row._id), row]));
  const semesterById = new Map(semesters.map((row) => [String(row._id), row]));
  const enrichPeriod = (item) => {
    const year = yearById.get(String(item.academicYearId || ''));
    const semester = semesterById.get(String(item.semesterId || ''));
    return {
      academicYearName: year?.name || '',
      academicYearSequence: year?.sequence ?? null,
      semesterName: semester?.name || '',
      semesterSequence: semester?.sequence ?? null,
    };
  };
  return {
    gpa,
    trend: trendSource.map((item) => ({
      ...item,
      ...enrichPeriod(item),
    })),
    distribution: Object.entries(distribution).map(([resultCode, count]) => ({ resultCode, count })),
    subjects: results.all.map((item) => ({
      subjectCode: item.subjectCode,
      subjectName: byCode.get(item.subjectCode)?.name || item.subjectCode,
      credits: byCode.get(item.subjectCode)?.credits || null,
      resultCode: item.resultCode,
      isEca: item.isEca,
      academicYearId: item.academicYearId,
      semesterId: item.semesterId,
      ...enrichPeriod(item),
      updatedAt: item.updatedAt,
    })),
    completedCount: results.all.filter((item) => !item.isEca).length,
    pendingEcaCount: results.all.filter((item) => item.isEca).length,
    explanation:
      'GPA and classification come from the official GPA service using counted credits. E(CA) and unlisted markers are excluded there. This page does not recalculate grade points.',
  };
}

export async function getUpcoming(principal) {
  assertStudent(principal);
  const events = await upcomingEvents(principal);
  return {
    generatedAt: new Date().toISOString(),
    deadlineGroups: groupUpcomingEvents(events.items),
    items: events.items,
  };
}

export async function searchStudentWorkspace(principal, query = {}) {
  assertStudent(principal);
  let q;
  try {
    q = sanitizeWorkspaceSearch(query.q);
  } catch (error) {
    if (error.message === 'SEARCH_TOO_LONG') {
      throw new ValidationError('Search is limited to 64 characters');
    }
    throw new ValidationError('Search does not accept pattern characters');
  }
  if (!q) {
    return { q, offerings: [], resources: [], notes: 'Enter a subject code, subject name, or official resource title.' };
  }
  const current = await listAccessibleOfferings(principal, {});
  const history = await listAccessibleOfferings(principal, { scope: 'history' });
  const offerings = [...current.items, ...history.items];
  const offeringHits = offerings.filter(
    (item) =>
      prefixRegex(q).test(item.subjectCode || '') || prefixRegex(q).test(item.subjectName || ''),
  );
  const offeringIds = offerings.map((item) => item.id);
  const objectIds = offeringIds.filter(Boolean).map((id) => new mongoose.Types.ObjectId(id));
  const resourceDocs = objectIds.length
    ? await OfficialResource.find({
        subjectOfferingId: { $in: objectIds },
        publicationState: 'PUBLISHED',
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
        title: prefixRegex(q),
      })
        .limit(20)
        .lean()
    : [];
  const files = await StoredFile.find({ _id: { $in: resourceDocs.map((item) => item.fileId) } }).lean();
  const fileById = new Map(files.map((file) => [String(file._id), file]));
  const offeringById = new Map(offerings.map((item) => [String(item.id), item]));
  const resources = [];
  for (const doc of resourceDocs) {
    const file = fileById.get(String(doc.fileId));
    if (!isStudentVisibleResource(doc, file)) {
      continue;
    }
    const offering = offeringById.get(String(doc.subjectOfferingId));
    resources.push({
      id: String(doc._id),
      title: doc.title,
      subjectCode: offering?.subjectCode || null,
      learningPath: `/learning/offerings/${doc.subjectOfferingId}`,
    });
  }
  return {
    q,
    offerings: offeringHits.slice(0, 20).map((item) => ({
      id: item.id,
      subjectCode: item.subjectCode,
      subjectName: item.subjectName,
      learningPath: `/learning/offerings/${item.id}`,
    })),
    resources,
    notes: 'Official resources only. Study Room files are not searched.',
  };
}
