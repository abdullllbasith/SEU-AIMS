import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const resultRevisionSchema = new mongoose.Schema(
  {
    academicResultId: { type: objectId, ref: 'AcademicResult', required: true },
    importId: { type: objectId, ref: 'ResultImport', required: true },
    actorUserId: { type: objectId, ref: 'User', required: true },
    registrationNumber: { type: String, required: true },
    subjectCode: { type: String, required: true },
    previousResultCode: { type: String, trim: true, default: '' },
    newResultCode: { type: String, required: true },
  },
  persistenceOptions,
);

resultRevisionSchema.index({ academicResultId: 1, createdAt: 1 });
resultRevisionSchema.index({ importId: 1 });

export const ResultRevision = defineModel('ResultRevision', resultRevisionSchema);
