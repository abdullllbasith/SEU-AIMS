import mongoose from 'mongoose';
import { CA_SUBJECT_EXAM_STATUSES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const caApplicationSubjectSchema = new mongoose.Schema(
  {
    applicationId: { type: objectId, ref: 'CaApplication', required: true },
    incompleteCaId: { type: objectId, ref: 'IncompleteCa', required: true },
    subjectId: { type: objectId, ref: 'Subject', required: true },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering' },
    examStatus: {
      type: String,
      required: true,
      enum: CA_SUBJECT_EXAM_STATUSES,
      default: 'PENDING_APPROVAL',
    },
    activeScheduleId: { type: objectId, ref: 'CaSchedule' },
    completedAt: Date,
    completedByUserId: { type: objectId, ref: 'User' },
    statusChangedAt: Date,
  },
  persistenceOptions,
);

caApplicationSubjectSchema.index({ applicationId: 1, incompleteCaId: 1 }, { unique: true });
caApplicationSubjectSchema.index({ subjectOfferingId: 1, examStatus: 1 });

export const CaApplicationSubject = defineModel('CaApplicationSubject', caApplicationSubjectSchema);
