import { IncompleteCa, CaApplication, CaSchedule } from '../../ca-recovery/index.js';
import { CA_APPLICATION_STATUSES } from '../../ca-recovery/constants.js';
import { departmentObjectId, parseObjectId, parsePage, prefixRegex, sanitizeSearch } from './scope.js';
import { ValidationError } from '../../../shared/errors/app-error.js';

export async function getCaOverview(principal) {
  const departmentId = departmentObjectId(principal);
  const now = new Date();
  const [byIncomplete, byApplication, upcomingSchedules, failedPdfs] = await Promise.all([
    IncompleteCa.aggregate([
      { $match: { departmentId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    CaApplication.aggregate([
      { $match: { departmentId } },
      { $group: { _id: '$workflowStatus', count: { $sum: 1 } } },
    ]),
    CaSchedule.countDocuments({ departmentId, cancelledAt: null, scheduledAt: { $gte: now } }),
    CaApplication.countDocuments({ departmentId, pdfStatus: 'FAILED' }),
  ]);

  const incomplete = Object.fromEntries(byIncomplete.map((row) => [row._id, row.count]));
  const applications = Object.fromEntries(byApplication.map((row) => [row._id, row.count]));
  for (const status of CA_APPLICATION_STATUSES) {
    if (applications[status] === undefined) {
      applications[status] = 0;
    }
  }

  return {
    incompleteCa: {
      OPEN: incomplete.OPEN || 0,
      IN_APPLICATION: incomplete.IN_APPLICATION || 0,
      RESOLVED: incomplete.RESOLVED || 0,
    },
    applications,
    upcomingAssessments: upcomingSchedules,
    failedApplicationPdfs: failedPdfs,
    notes: [
      'Statuses are the CA Recovery workflow enums. No extra dashboard-only academic states.',
      'Approve/reject/reopen stay on /api/ca/admin.',
    ],
  };
}

export async function listCaApplications(principal, query = {}) {
  const departmentId = departmentObjectId(principal);
  const { page, pageSize } = parsePage(query);
  const filter = { departmentId };
  const q = sanitizeSearch(query.q);
  if (q.includes('/') || q.toUpperCase().startsWith('QA-') || q.toUpperCase().startsWith('CA-')) {
    if (q.includes('/')) {
      filter.registrationNumber = prefixRegex(q.toUpperCase());
    } else {
      filter.applicationId = prefixRegex(q.toUpperCase());
    }
  } else if (q) {
    filter.$or = [
      { applicationId: prefixRegex(q.toUpperCase()) },
      { registrationNumber: prefixRegex(q.toUpperCase()) },
    ];
  }
  if (query.workflowStatus) {
    if (!CA_APPLICATION_STATUSES.includes(query.workflowStatus)) {
      throw new ValidationError('Invalid workflowStatus');
    }
    filter.workflowStatus = query.workflowStatus;
  }
  const semesterId = parseObjectId(query.semesterId, 'semesterId');
  const academicYearId = parseObjectId(query.academicYearId, 'academicYearId');
  if (semesterId) {
    filter.semesterId = semesterId;
  }
  if (academicYearId) {
    filter.academicYearId = academicYearId;
  }

  const [items, total] = await Promise.all([
    CaApplication.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .select(
        'applicationId registrationNumber workflowStatus physicalVerificationStatus pdfStatus academicYearId semesterId submittedAt',
      )
      .lean(),
    CaApplication.countDocuments(filter),
  ]);

  return {
    page,
    pageSize,
    total,
    items: items.map((row) => ({
      applicationId: row.applicationId,
      registrationNumber: row.registrationNumber,
      workflowStatus: row.workflowStatus,
      physicalVerificationStatus: row.physicalVerificationStatus,
      pdfStatus: row.pdfStatus,
      academicYearId: String(row.academicYearId),
      semesterId: String(row.semesterId),
      submittedAt: row.submittedAt || null,
    })),
  };
}
