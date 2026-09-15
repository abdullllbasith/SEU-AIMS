import { IncompleteCa } from '../../ca-recovery/models/incomplete-ca.model.js';
import { CaSchedule } from '../../ca-recovery/models/ca-schedule.model.js';
import { AcademicResult } from '../../results/models/academic-result.model.js';
import { CalendarEvent } from '../../notices-calendar/models/calendar-event.model.js';
import { SubjectOffering } from '../../academic-foundation/models/subject-offering.model.js';
import { Subject } from '../../academic-foundation/models/subject.model.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';

function assertAdmin(principal) {
  if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR || !principal.departmentId) {
    throw new ForbiddenError('Forbidden');
  }
}

/**
 * Diagnostic integrity checks. Does not auto-repair academic data.
 */
export async function runIntegrityChecks(principal) {
  assertAdmin(principal);
  const departmentId = principal.departmentId;
  const issues = [];

  const openConditions = await IncompleteCa.find({ departmentId, status: 'OPEN' }).limit(200);
  for (const condition of openConditions) {
    const result = await AcademicResult.findById(condition.academicResultId);
    if (!result) {
      issues.push({ code: 'eca_missing_result', entityId: String(condition._id) });
    } else if (!result.isEca) {
      issues.push({ code: 'eca_open_but_result_cleared', entityId: String(condition._id) });
    }
  }

  const schedules = await CaSchedule.find({ departmentId, cancelledAt: null }).limit(200);
  for (const schedule of schedules) {
    const event = await CalendarEvent.findById(schedule.calendarEventId);
    if (!event) {
      issues.push({ code: 'schedule_missing_calendar', entityId: String(schedule._id) });
    } else if (event.cancelledAt) {
      issues.push({ code: 'schedule_calendar_cancelled', entityId: String(schedule._id) });
    }
  }

  const offerings = await SubjectOffering.find({ departmentId }).limit(200);
  for (const offering of offerings) {
    const subject = await Subject.findById(offering.subjectId);
    if (!subject) {
      issues.push({ code: 'offering_missing_subject', entityId: String(offering._id) });
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    issueCount: issues.length,
    issues,
    notes: 'Diagnostic only. Repair is a separate, auditable action.',
  };
}
