import mongoose from 'mongoose';
import { ENROLLMENT_STATUSES, ENROLLMENT_TYPES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const subjectEnrollmentSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    batchId: { type: objectId, ref: 'Batch', required: true },
    studentUserId: { type: objectId, ref: 'User', required: true },
    studentAcademicContextId: { type: objectId, ref: 'StudentAcademicContext', required: true },
    registrationNumber: { type: String, required: true, trim: true, uppercase: true },
    subjectId: { type: objectId, ref: 'Subject', required: true },
    subjectCode: { type: String, required: true, trim: true, uppercase: true },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering', required: true },
    enrollmentType: { type: String, required: true, enum: ENROLLMENT_TYPES },
    status: { type: String, required: true, enum: ENROLLMENT_STATUSES, default: 'ACTIVE' },
    academicResultId: { type: objectId, ref: 'AcademicResult' },
    originalAcademicYearId: { type: objectId, ref: 'AcademicYear' },
    originalSemesterId: { type: objectId, ref: 'Semester' },
    createdByUserId: { type: objectId, ref: 'User', required: true },
    cancelledAt: { type: Date, default: null },
    cancelledByUserId: { type: objectId, ref: 'User', default: null },
  },
  persistenceOptions,
);

// One active enrollment per student and offering. Cancelled rows stay so a later POST can create a new active row.
subjectEnrollmentSchema.index(
  { studentUserId: 1, subjectOfferingId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' } },
);
subjectEnrollmentSchema.index({ departmentId: 1, subjectOfferingId: 1, status: 1 });
subjectEnrollmentSchema.index({ departmentId: 1, studentUserId: 1, status: 1 });
subjectEnrollmentSchema.index({ studentAcademicContextId: 1, createdAt: -1 });

export const SubjectEnrollment = defineModel('SubjectEnrollment', subjectEnrollmentSchema);
