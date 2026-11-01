import { AcademicYear, Semester, SubjectOffering } from '../../academic-foundation/index.js';
import { resolveActiveOfferingForSubject } from './offering-resolver.js';
import { AcademicResult } from '../../results/models/academic-result.model.js';
import { IncompleteCa } from '../models/incomplete-ca.model.js';
import { CaSchedule } from '../models/ca-schedule.model.js';
import { CaApplication } from '../models/ca-application.model.js';
import { CaApplicationSubject } from '../models/ca-application-subject.model.js';
import { syncIncompleteCaFromResult } from './eca-from-results.js';
import { recordCaAudit } from './notify.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';

function assertAdmin(principal) {
  if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR || !principal.departmentId) {
    throw new ForbiddenError('Forbidden');
  }
}

export async function reconcileCaConditions(principal) {
  assertAdmin(principal);
  const departmentId = principal.departmentId;
  const issues = [];
  const ecaResults = await AcademicResult.find({ departmentId, isEca: true })
    .select('_id registrationNumber subjectCode')
    .lean();
  const conditions = await IncompleteCa.find({ academicResultId: { $in: ecaResults.map((row) => row._id) } })
    .select('academicResultId status')
    .lean();
  const byResult = new Map(conditions.map((row) => [String(row.academicResultId), row]));
  for (const result of ecaResults) {
    const condition = byResult.get(String(result._id));
    if (!condition) {
      issues.push({
        issue: 'ECA_WITHOUT_CONDITION',
        entity: 'AcademicResult',
        entityId: String(result._id),
        registrationNumber: result.registrationNumber,
        subjectCode: result.subjectCode,
        recommendedAction: 'Run the CA backfill. It creates the missing condition and does not change the official result.',
      });
    } else if (condition.status === 'RESOLVED') {
      issues.push({
        issue: 'RESOLVED_CONDITION_STILL_ECA',
        entity: 'IncompleteCa',
        entityId: String(condition._id),
        registrationNumber: result.registrationNumber,
        subjectCode: result.subjectCode,
        recommendedAction: 'The official result is still E(CA). Review before changing either record. This report does not edit them.',
      });
    }
  }

  const openConditions = await IncompleteCa.find({ departmentId, status: { $in: ['OPEN', 'IN_APPLICATION'] } })
    .select('academicResultId registrationNumber subjectCode')
    .lean();
  const linkedResults = await AcademicResult.find({ _id: { $in: openConditions.map((row) => row.academicResultId) } })
    .select('isEca')
    .lean();
  const resultById = new Map(linkedResults.map((row) => [String(row._id), row]));
  for (const condition of openConditions) {
    const result = resultById.get(String(condition.academicResultId));
    if (!result || !result.isEca) {
      issues.push({
        issue: 'OPEN_CONDITION_WITHOUT_ECA',
        entity: 'IncompleteCa',
        entityId: String(condition._id),
        registrationNumber: condition.registrationNumber,
        subjectCode: condition.subjectCode,
        recommendedAction: 'An open condition is not tied to a current E(CA) result. Confirm before changing it.',
      });
    }
  }

  const schedules = await CaSchedule.find({
    departmentId,
    $or: [{ status: 'ACTIVE' }, { status: { $exists: false }, cancelledAt: { $exists: false } }],
  })
    .select('applicationId')
    .lean();
  if (schedules.length) {
    const applications = await CaApplication.find({
      _id: { $in: schedules.map((row) => row.applicationId) },
      departmentId,
      workflowStatus: { $nin: ['APPROVED', 'SCHEDULED', 'COMPLETED', 'RESOLVED'] },
    })
      .select('applicationId workflowStatus')
      .lean();
    for (const application of applications) {
      issues.push({
        issue: 'SCHEDULE_FOR_INELIGIBLE_APPLICATION',
        entity: 'CaApplication',
        entityId: String(application._id),
        recommendedAction: `Application ${application.applicationId} is ${application.workflowStatus} but still has a schedule. Review it. This report does not cancel the schedule.`,
      });
    }
  }

  return { issues, issueCount: issues.length };
}

export async function listUnresolvedEcaConditions(principal) {
  assertAdmin(principal);
  const filter = { departmentId: principal.departmentId, status: 'OPEN' };
  const [rows, total] = await Promise.all([
    IncompleteCa.find(filter).sort({ detectedAt: -1, createdAt: -1 }).limit(100).lean(),
    IncompleteCa.countDocuments(filter),
  ]);
  const results = await AcademicResult.find({ _id: { $in: rows.map((row) => row.academicResultId) } })
    .select('studentAcademicYearId studentSemesterId')
    .lean();
  const resultById = new Map(results.map((result) => [String(result._id), result]));
  const yearIds = results.map((result) => result.studentAcademicYearId).filter(Boolean);
  const semesterIds = results.map((result) => result.studentSemesterId).filter(Boolean);
  const [years, semesters] = await Promise.all([
    yearIds.length ? AcademicYear.find({ _id: { $in: yearIds } }).select('name sequence').lean() : [],
    semesterIds.length ? Semester.find({ _id: { $in: semesterIds } }).select('name sequence').lean() : [],
  ]);
  const yearById = new Map(years.map((year) => [String(year._id), year]));
  const semesterById = new Map(semesters.map((semester) => [String(semester._id), semester]));
  return {
    total,
    items: rows.map((row) => {
      const result = resultById.get(String(row.academicResultId));
      const subjectYear = result?.studentAcademicYearId ? yearById.get(String(result.studentAcademicYearId)) : null;
      const subjectSemester = result?.studentSemesterId ? semesterById.get(String(result.studentSemesterId)) : null;
      return {
        id: String(row._id),
        registrationNumber: row.registrationNumber,
        subjectCode: row.subjectCode,
        academicYearId: row.academicYearId ? String(row.academicYearId) : '',
        semesterId: row.semesterId ? String(row.semesterId) : '',
        subjectAcademicYearId: result?.studentAcademicYearId ? String(result.studentAcademicYearId) : '',
        subjectSemesterId: result?.studentSemesterId ? String(result.studentSemesterId) : '',
        subjectAcademicYearName: subjectYear?.name || '',
        subjectAcademicYearSequence: subjectYear?.sequence ?? null,
        subjectSemesterName: subjectSemester?.name || '',
        subjectSemesterSequence: subjectSemester?.sequence ?? null,
        status: row.status,
        detectedAt: row.detectedAt || null,
      };
    }),
  };
}

// Links created before subject-level states have no examStatus field at all (the schema default only applies
// to new documents), so a missing field is treated like the PENDING_APPROVAL default.
const UNSET_EXAM_STATUS = { $or: [{ examStatus: 'PENDING_APPROVAL' }, { examStatus: { $exists: false } }] };

/**
 * Approved links that never matched a running offering are invisible to every lecturer; point them at the
 * currently active offering of their subject. Returns how many links changed.
 */
export async function relinkApprovedLinks(departmentId) {
  const applications = await CaApplication.find({
    departmentId,
    workflowStatus: { $in: ['APPROVED', 'SCHEDULED'] },
  }).select('_id');
  let relinked = 0;
  const links = await CaApplicationSubject.find({
    applicationId: { $in: applications.map((item) => item._id) },
    examStatus: 'READY_TO_SCHEDULE',
  });
  for (const link of links) {
    const current = link.subjectOfferingId ? await SubjectOffering.findById(link.subjectOfferingId) : null;
    if (current?.status === 'ACTIVE') {
      continue;
    }
    const offering = await resolveActiveOfferingForSubject({
      departmentId,
      subjectId: link.subjectId,
      preferBatchId: current?.batchId,
    });
    if (offering) {
      link.subjectOfferingId = offering._id;
      await link.save();
      relinked += 1;
    }
  }
  return relinked;
}

/**
 * Give pre-existing schedules and subject links their subject-level state. Idempotent: it only touches
 * schedules with no status and links still at the default PENDING_APPROVAL on an already approved application.
 */
export async function backfillSubjectExamStates(departmentId) {
  // Replaces the old unique (application, subject) and unique calendar-event indexes.
  await CaSchedule.syncIndexes();
  await CaSchedule.updateMany(
    { departmentId, status: { $exists: false }, cancelledAt: { $exists: true } },
    { $set: { status: 'CANCELLED', generation: 1 } },
  );
  await CaSchedule.updateMany(
    { departmentId, status: { $exists: false } },
    { $set: { status: 'ACTIVE', generation: 1 } },
  );
  const applications = await CaApplication.find({
    departmentId,
    workflowStatus: { $in: ['APPROVED', 'SCHEDULED', 'COMPLETED', 'RESOLVED'] },
  }).select('workflowStatus');
  const counts = { READY_TO_SCHEDULE: 0, SCHEDULED: 0, COMPLETED: 0, RESOLVED: 0 };
  await relinkApprovedLinks(departmentId);
  for (const application of applications) {
    const links = await CaApplicationSubject.find({ applicationId: application._id, ...UNSET_EXAM_STATUS });
    for (const link of links) {
      const condition = await IncompleteCa.findById(link.incompleteCaId).select('status');
      const schedule = await CaSchedule.findOne({
        applicationId: application._id,
        incompleteCaId: link.incompleteCaId,
        status: 'ACTIVE',
      });
      let examStatus = 'READY_TO_SCHEDULE';
      if (condition?.status === 'RESOLVED' || application.workflowStatus === 'RESOLVED') {
        examStatus = 'RESOLVED';
      } else if (schedule) {
        examStatus = 'SCHEDULED';
      } else if (application.workflowStatus === 'COMPLETED') {
        examStatus = 'COMPLETED';
      }
      await CaApplicationSubject.updateOne(
        { _id: link._id, ...UNSET_EXAM_STATUS },
        {
          $set: {
            examStatus,
            statusChangedAt: new Date(),
            ...(examStatus === 'SCHEDULED' ? { activeScheduleId: schedule._id } : {}),
          },
        },
      );
      counts[examStatus] += 1;
    }
  }
  return counts;
}

export async function backfillMissingCaConditions(principal) {
  assertAdmin(principal);
  const subjects = await backfillSubjectExamStates(principal.departmentId);
  const results = await AcademicResult.find({ departmentId: principal.departmentId, isEca: true });
  let created = 0;
  let existing = 0;
  for (const result of results) {
    const prior = await IncompleteCa.findOne({ academicResultId: result._id }).select('_id');
    if (prior) {
      existing += 1;
      continue;
    }
    await syncIncompleteCaFromResult(result);
    created += 1;
  }
  await recordCaAudit({
    actorUserId: principal.userId,
    action: 'ca.conditions.backfill',
    entityType: 'IncompleteCa',
    entityId: principal.departmentId,
    departmentId: principal.departmentId,
    metadata: { created, existing, subjects },
  });
  return { created, existing, examined: results.length, subjects };
}
