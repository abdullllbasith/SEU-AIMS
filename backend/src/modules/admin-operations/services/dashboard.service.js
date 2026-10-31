import { User } from '../../authentication/index.js';
import {
  Batch,
  Semester,
  SubjectOffering,
} from '../../academic-foundation/index.js';
import { OfficialResource } from '../../learning-environment/index.js';
import { ResultImport } from '../../results/index.js';
import { IncompleteCa, CaApplication, CaSchedule } from '../../ca-recovery/index.js';
import { Notification } from '../../notifications/index.js';
import { AuditEvent } from '../../audit-security/index.js';
import { queueSnapshot } from '../../../infrastructure/observability/health.service.js';
import { ROLES } from '../../../shared/constants/roles.js';
import {
  KPI_CATALOG,
  PENDING_RESULT_IMPORT_STATUSES,
  PENDING_CA_APPLICATION_STATUSES,
} from '../constants.js';
import { departmentObjectId } from './scope.js';
import { getAdminDashboardCache, setAdminDashboardCache } from './dashboard-cache.js';

export async function getDashboard(principal, { infrastructure, bypassCache = false } = {}) {
  const departmentId = departmentObjectId(principal);
  if (!bypassCache) {
    const cached = getAdminDashboardCache(departmentId);
    if (cached) {
      return { ...cached, cacheHit: true };
    }
  }

  const now = new Date();
  const [
    activeStudents,
    activeLecturers,
    activeBatches,
    activeSemesters,
    activeSubjectOfferings,
    unpublishedOfficialResources,
    pendingResultImports,
    unresolvedEcaConditions,
    pendingCaApplications,
    upcomingCaAssessments,
    failedNotifications,
    deniedAuditEvents,
    queue,
  ] = await Promise.all([
    User.countDocuments({ departmentId, role: ROLES.STUDENT, accountStatus: 'ACTIVE' }),
    User.countDocuments({ departmentId, role: ROLES.LECTURER, accountStatus: 'ACTIVE' }),
    Batch.countDocuments({ departmentId, status: 'ACTIVE' }),
    Semester.countDocuments({ departmentId, status: 'ACTIVE' }),
    SubjectOffering.countDocuments({ departmentId, status: 'ACTIVE' }),
    OfficialResource.countDocuments({
      departmentId,
      publicationState: { $in: ['DRAFT', 'UNPUBLISHED'] },
      deletedAt: null,
    }),
    ResultImport.countDocuments({
      departmentId,
      processingStatus: { $in: [...PENDING_RESULT_IMPORT_STATUSES] },
    }),
    IncompleteCa.countDocuments({ departmentId, status: 'OPEN' }),
    CaApplication.countDocuments({
      departmentId,
      workflowStatus: { $in: [...PENDING_CA_APPLICATION_STATUSES] },
    }),
    CaSchedule.countDocuments({
      departmentId,
      cancelledAt: null,
      status: { $nin: ['CANCELLED', 'SUPERSEDED', 'COMPLETED'] },
      scheduledAt: { $gte: now },
    }),
    Notification.countDocuments({ departmentId, status: 'FAILED' }),
    AuditEvent.countDocuments({ departmentId, result: 'DENIED' }),
    queueSnapshot(infrastructure?.queue),
  ]);

  const payload = {
    freshness: 'on-request',
    cacheTtlMs: 15_000,
    computedAt: new Date().toISOString(),
    departmentScoped: true,
    ignoredClientDepartmentId: true,
    catalog: KPI_CATALOG,
    cards: {
      activeStudents,
      activeLecturers,
      activeBatches,
      activeSemesters,
      activeSubjectOfferings,
      unpublishedOfficialResources,
      pendingResultImports,
      unresolvedEcaConditions,
      pendingCaApplications,
      upcomingCaAssessments,
      failedNotifications,
      failedBackgroundJobs: queue.failed,
      deniedAuditEvents,
    },
    queue,
    notes: [
      'Cards are derived counts. They are not an edit surface.',
      'Queue depth/failed is the worker list for this process or Redis, not split by department.',
      'Study Room message content is not included.',
    ],
    cacheHit: false,
  };
  setAdminDashboardCache(departmentId, payload);
  return payload;
}
