import { IncompleteCa } from '../models/incomplete-ca.model.js';
import { CaApplication } from '../models/ca-application.model.js';
import { CaApplicationSubject } from '../models/ca-application-subject.model.js';

export async function syncIncompleteCaFromResult(result) {
  const existing = await IncompleteCa.findOne({ academicResultId: result._id });
  if (result.isEca) {
    if (existing) {
      existing.status = existing.status === 'RESOLVED' ? 'OPEN' : existing.status;
      existing.registrationNumber = result.registrationNumber;
      existing.subjectCode = result.subjectCode;
      existing.academicYearId = result.studentAcademicYearId;
      existing.semesterId = result.studentSemesterId;
      existing.departmentId = result.departmentId;
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
    await existing.save();
    await maybeResolveApplication(existing);
  }
  return existing;
}

async function maybeResolveApplication(incomplete) {
  const links = await CaApplicationSubject.find({ incompleteCaId: incomplete._id });
  for (const link of links) {
    const siblings = await CaApplicationSubject.find({ applicationId: link.applicationId });
    const conditions = await IncompleteCa.find({ _id: { $in: siblings.map((item) => item.incompleteCaId) } });
    if (conditions.length && conditions.every((item) => item.status === 'RESOLVED')) {
      await CaApplication.updateOne(
        { _id: link.applicationId, workflowStatus: { $in: ['COMPLETED', 'SCHEDULED', 'APPROVED'] } },
        { $set: { workflowStatus: 'RESOLVED' } },
      );
    }
  }
}
