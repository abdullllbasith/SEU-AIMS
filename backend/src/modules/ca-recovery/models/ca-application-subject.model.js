import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const caApplicationSubjectSchema = new mongoose.Schema(
  {
    applicationId: { type: objectId, ref: 'CaApplication', required: true },
    incompleteCaId: { type: objectId, ref: 'IncompleteCa', required: true },
    subjectId: { type: objectId, ref: 'Subject', required: true },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering' },
  },
  persistenceOptions,
);

caApplicationSubjectSchema.index({ applicationId: 1, incompleteCaId: 1 }, { unique: true });

export const CaApplicationSubject = defineModel('CaApplicationSubject', caApplicationSubjectSchema);
