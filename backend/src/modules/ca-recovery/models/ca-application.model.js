import mongoose from 'mongoose';
import {
  CA_ACTIVE_APPLICATION_STATUSES,
  CA_APPLICATION_STATUSES,
  CA_PDF_STATUSES,
  PHYSICAL_VERIFICATION_STATUSES,
} from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const caApplicationSchema = new mongoose.Schema(
  {
    applicationId: { type: String, required: true, trim: true },
    departmentId: { type: objectId, ref: 'Department', required: true },
    studentUserId: { type: objectId, ref: 'User', required: true },
    registrationNumber: { type: String, required: true, trim: true, uppercase: true },
    academicYearId: { type: objectId, ref: 'AcademicYear', required: true },
    semesterId: { type: objectId, ref: 'Semester', required: true },
    windowId: { type: objectId, ref: 'CaApplicationWindow' },
    windowOpensAt: { type: Date, required: true },
    windowClosesAt: { type: Date, required: true },
    workflowStatus: {
      type: String,
      required: true,
      enum: CA_APPLICATION_STATUSES,
      default: 'DRAFT',
    },
    physicalVerificationStatus: {
      type: String,
      required: true,
      enum: PHYSICAL_VERIFICATION_STATUSES,
      default: 'NOT_STARTED',
    },
    pdfStatus: {
      type: String,
      required: true,
      enum: CA_PDF_STATUSES,
      default: 'PENDING',
    },
    pdfTemplateVersion: { type: String, trim: true },
    pdfFileId: { type: objectId, ref: 'StoredFile' },
    qrVerificationToken: { type: String, trim: true },
    decisionReason: { type: String, trim: true, default: '' },
    reopenReason: { type: String, trim: true, default: '' },
    resubmissionCount: { type: Number, required: true, default: 0 },
    submittedAt: Date,
    physicallyVerifiedAt: Date,
    verifiedByAdminUserId: { type: objectId, ref: 'User' },
    decidedAt: Date,
    decidedByUserId: { type: objectId, ref: 'User' },
    reopenedAt: Date,
    reopenedByUserId: { type: objectId, ref: 'User' },
  },
  persistenceOptions,
);

caApplicationSchema.index({ applicationId: 1 }, { unique: true });
caApplicationSchema.index({ qrVerificationToken: 1 }, { unique: true, sparse: true });
caApplicationSchema.index(
  { studentUserId: 1, academicYearId: 1, semesterId: 1 },
  {
    unique: true,
    name: 'unique_active_ca_application_per_semester',
    partialFilterExpression: {
      workflowStatus: { $in: [...CA_ACTIVE_APPLICATION_STATUSES] },
    },
  },
);
caApplicationSchema.index({ workflowStatus: 1 });
caApplicationSchema.index({ departmentId: 1, workflowStatus: 1, createdAt: 1 });
caApplicationSchema.index({ registrationNumber: 1 });

export const CaApplication = defineModel('CaApplication', caApplicationSchema);
