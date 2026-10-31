import { AcademicResult } from '../../results/models/academic-result.model.js';
import { IncompleteCa } from '../models/incomplete-ca.model.js';
import { CaApplicationSubject } from '../models/ca-application-subject.model.js';
import { CaSchedule } from '../models/ca-schedule.model.js';
import { syncApplicationStatusFromSubjects } from './application-status.service.js';
import { cancelNotificationsFor } from './reminder.service.js';

export async function syncIncompleteCaFromResult(result) {
  const existing = await IncompleteCa.findOne({ academicResultId: result._id });
  if (result.isEca) {
    if (existing) {
      if (existing.status === 'RESOLVED') {
        existing.status = 'OPEN';
        existing.resolvedAt = undefined;
        existing.resolutionSource = '';
      }
      existing.registrationNumber = result.registrationNumber;
      existing.subjectCode = result.subjectCode;
      existing.academicYearId = result.studentAcademicYearId;
      existing.semesterId = result.studentSemesterId;
      existing.departmentId = result.departmentId;
      existing.sourceImportId = result.sourceImportId || existing.sourceImportId;
      existing.sourceResultVersion = result.version;
      existing.detectedAt = existing.detectedAt || new Date();
      await existing.save();
      return existing;
    }
    try {
      return await IncompleteCa.create({
        studentUserId: result.studentUserId,
        registrationNumber: result.registrationNumber,
        subjectId: result.subjectId,
        subjectCode: result.subjectCode,
        academicYearId: result.studentAcademicYearId,
        semesterId: result.studentSemesterId,
        academicResultId: result._id,
        departmentId: result.departmentId,
        sourceImportId: result.sourceImportId,
        sourceResultVersion: result.version,
        detectedAt: new Date(),
        status: 'OPEN',
      });
    } catch (error) {
      if (error?.code === 11000) {
        return IncompleteCa.findOne({ academicResultId: result._id });
      }
      throw error;
    }
  }
  if (existing && existing.status !== 'RESOLVED') {
    existing.status = 'RESOLVED';
    existing.resolvedAt = new Date();
    existing.resolutionSource = 'OFFICIAL_RESULT';
    existing.sourceImportId = result.sourceImportId || existing.sourceImportId;
    existing.sourceResultVersion = result.version;
    await existing.save();
    await maybeResolveApplication(existing);
  }
  return existing;
}

/** Point stored E(CA) conditions at the official result period, not the student's current semester. */
export async function realignIncompleteCaPeriods() {
  const conditions = await IncompleteCa.find();
  const results = await AcademicResult.find({ _id: { $in: conditions.map((row) => row.academicResultId) } })
    .select('studentAcademicYearId studentSemesterId')
    .lean();
  const resultById = new Map(results.map((result) => [String(result._id), result]));
  let moved = 0;
  let alreadyAligned = 0;
  let missingResult = 0;
  for (const condition of conditions) {
    const result = resultById.get(String(condition.academicResultId));
    if (!result?.studentAcademicYearId || !result?.studentSemesterId) {
      missingResult += 1;
      continue;
    }
    if (
      String(condition.academicYearId) === String(result.studentAcademicYearId) &&
      String(condition.semesterId) === String(result.studentSemesterId)
    ) {
      alreadyAligned += 1;
      continue;
    }
    condition.academicYearId = result.studentAcademicYearId;
    condition.semesterId = result.studentSemesterId;
    try {
      await condition.save();
      moved += 1;
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
  }
  return { scanned: conditions.length, moved, alreadyAligned, missingResult };
}

/**
 * An official result resolved this E(CA) condition. Resolve only the linked subject(s): cancel that
 * subject's unsent exam notifications, then let the application status be derived from all its subjects.
 */
async function maybeResolveApplication(incomplete) {
  const links = await CaApplicationSubject.find({ incompleteCaId: incomplete._id });
  for (const link of links) {
    const previous = await CaApplicationSubject.findOneAndUpdate(
      { _id: link._id, examStatus: { $ne: 'RESOLVED' } },
      { $set: { examStatus: 'RESOLVED', statusChangedAt: new Date() }, $unset: { activeScheduleId: '' } },
    );
    if (previous?.activeScheduleId) {
      const schedule = await CaSchedule.findOneAndUpdate(
        { _id: previous.activeScheduleId, status: 'ACTIVE' },
        { $set: { status: 'CANCELLED', cancelledAt: new Date() } },
      );
      if (schedule?.examNoticeId) {
        await cancelNotificationsFor({ noticeId: schedule.examNoticeId, linkId: link._id }, 'subject_resolved');
      }
    }
    await syncApplicationStatusFromSubjects(link.applicationId, { linkId: String(link._id), reason: 'Official result' });
  }
}
