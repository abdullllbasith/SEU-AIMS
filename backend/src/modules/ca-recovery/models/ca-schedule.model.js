import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const caScheduleSchema = new mongoose.Schema(
  {
    applicationId: { type: objectId, ref: 'CaApplication', required: true },
    incompleteCaId: { type: objectId, ref: 'IncompleteCa', required: true },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering', required: true },
    lecturerUserId: { type: objectId, ref: 'User', required: true },
    calendarEventId: { type: objectId, ref: 'CalendarEvent', required: true },
    scheduledAt: { type: Date, required: true },
  },
  persistenceOptions,
);

caScheduleSchema.index({ applicationId: 1, incompleteCaId: 1 }, { unique: true });
caScheduleSchema.index({ subjectOfferingId: 1, lecturerUserId: 1 });
caScheduleSchema.index({ calendarEventId: 1 }, { unique: true });

export const CaSchedule = defineModel('CaSchedule', caScheduleSchema);
