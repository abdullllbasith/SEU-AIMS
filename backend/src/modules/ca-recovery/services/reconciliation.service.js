import { AcademicYear, Semester } from '../../academic-foundation/index.js';
import { AcademicResult } from '../../results/models/academic-result.model.js';
import { IncompleteCa } from '../models/incomplete-ca.model.js';
import { CaSchedule } from '../models/ca-schedule.model.js';
import { CaApplication } from '../models/ca-application.model.js';
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

  const schedules = await CaSchedule.find({ departmentId, cancelledAt: { $exists: false } })
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

export async function backfillMissingCaConditions(principal) {
  assertAdmin(principal);
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
    metadata: { created, existing },
  });
  return { created, existing, examined: results.length };
}
