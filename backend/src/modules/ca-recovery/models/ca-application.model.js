import mongoose from 'mongoose';
import { CA_APPLICATION_STATUSES, PHYSICAL_VERIFICATION_STATUSES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const caApplicationSchema = new mongoose.Schema(
  {
    applicationId: { type: String, required: true, trim: true },
    studentUserId: { type: objectId, ref: 'User', required: true },
    academicYearId: { type: objectId, ref: 'AcademicYear', required: true },
    semesterId: { type: objectId, ref: 'Semester', required: true },
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
    pdfFileId: { type: objectId, ref: 'StoredFile' },
    qrVerificationToken: { type: String, trim: true },
    submittedAt: Date,
    physicallyVerifiedAt: Date,
    verifiedByAdminUserId: { type: objectId, ref: 'User' },
    decidedAt: Date,
    reopenedAt: Date,
    reopenedByUserId: { type: objectId, ref: 'User' },
  },
  persistenceOptions,
);

caApplicationSchema.index({ applicationId: 1 }, { unique: true });
caApplicationSchema.index({ qrVerificationToken: 1 }, { unique: true, sparse: true });
caApplicationSchema.index({ studentUserId: 1, academicYearId: 1, semesterId: 1 }, { unique: true });
caApplicationSchema.index({ workflowStatus: 1 });

export const CaApplication = defineModel('CaApplication', caApplicationSchema);
