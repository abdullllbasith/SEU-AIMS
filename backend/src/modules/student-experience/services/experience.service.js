import { ROLES } from '../../../shared/constants/roles.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';
import {
  getMyContext,
  getMyOfferings,
  LecturerAssignment,
  Subject,
} from '../../academic-foundation/index.js';
import { getOwnResults } from '../../results/index.js';
import { getStudentGpaSummary, GpaSnapshot } from '../../gpa-cgpa/index.js';
import { listNotices, upcomingEvents } from '../../notices-calendar/index.js';
import { listInbox, unreadCount } from '../../notifications/index.js';
import { listOwnApplications, IncompleteCa, CaSchedule } from '../../ca-recovery/index.js';
import { listAccessibleOfferings, listResources } from '../../learning-environment/index.js';
import { User } from '../../authentication/index.js';
import { presentGpaSummary } from '../utils/gpa-presentation.js';
import { dashboardCacheKey, getDashboardCache, setDashboardCache } from './dashboard-cache.js';
import { getOwnProfile } from './profile.service.js';

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
    caPath: '/ca',
  };
}

async function resourceSummary(principal) {
  const offerings = await listAccessibleOfferings(principal, {});
  const resources = [];
  for (const offering of offerings.items.slice(0, 6)) {
    const listed = await listResources(principal, offering.id, { pageSize: 3 });
    for (const item of listed.items) {
      resources.push({
        id: item.id,
        title: item.title,
        offeringId: offering.id,
        subjectCode: offering.subjectCode,
      });
    }
  }
  return {
    offerings: offerings.items.map((item) => ({
      id: item.id,
      subjectCode: item.subjectCode,
      subjectName: item.subjectName,
    })),
    latestResources: resources.slice(0, 8),
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
  const lecturers = await lecturerNames(offeringsResult.items.map((item) => item.id));
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
    settle('Learning', () => resourceSummary(principal)),
  ]);

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
    currentSubjects: offeringsResult.items.map((item) => ({
      id: item.id,
      subjectCode: item.subjectCode,
      subjectName: item.subjectName,
      lecturers: lecturers.get(item.id) || [],
      learningPath: `/learning/offerings/${item.id}`,
    })),
    notices: notices.ok ? notices.data.items : [],
    upcomingEvents: events.ok ? events.data.items : [],
    notifications: {
      unreadCount: unread.ok ? unread.data.count : null,
      recent: inbox.ok ? inbox.data.items : [],
    },
    performance: gpaRaw.ok ? presentGpaSummary(gpaRaw.data) : { available: false, gpa: null, cgpa: null },
    results: results.ok
      ? {
          current: results.data.current,
          eca: results.data.current.filter((item) => item.isEca),
        }
      : null,
    caRecovery: ca.ok ? ca.data : null,
    resources: learning.ok ? learning.data : null,
    sections: {
      profile,
      notices,
      calendar: events,
      notifications: unread.ok && inbox.ok ? { ok: true } : { ok: false, error: 'Notifications are temporarily unavailable.' },
      results,
      gpa: gpaRaw,
      ca,
      learning,
    },
    cache: { hit: false },
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
  return {
    gpa,
    trend: gpa.available ? gpa.semesters : [],
    distribution: Object.entries(distribution).map(([resultCode, count]) => ({ resultCode, count })),
    subjects: results.all.map((item) => ({
      subjectCode: item.subjectCode,
      subjectName: byCode.get(item.subjectCode)?.name || item.subjectCode,
      credits: byCode.get(item.subjectCode)?.credits || null,
      resultCode: item.resultCode,
      isEca: item.isEca,
      academicYearId: item.academicYearId,
      semesterId: item.semesterId,
      updatedAt: item.updatedAt,
    })),
    completedCount: results.all.filter((item) => !item.isEca).length,
    pendingEcaCount: results.all.filter((item) => item.isEca).length,
  };
}
