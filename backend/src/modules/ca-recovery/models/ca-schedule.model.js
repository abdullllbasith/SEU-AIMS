import mongoose from 'mongoose';
import { CA_SCHEDULE_STATUSES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

/**
 * One row per (application subject link, exam notice, generation). Rows are history:
 * a reschedule marks the old row SUPERSEDED and adds a new ACTIVE row; a cancel marks it CANCELLED.
 */
const caScheduleSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    applicationId: { type: objectId, ref: 'CaApplication', required: true },
    incompleteCaId: { type: objectId, ref: 'IncompleteCa', required: true },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering', required: true },
    lecturerUserId: { type: objectId, ref: 'User', required: true },
    calendarEventId: { type: objectId, ref: 'CalendarEvent', required: true },
    examNoticeId: { type: objectId, ref: 'CaExamNotice' },
    generation: { type: Number, required: true, default: 1 },
    status: { type: String, required: true, enum: CA_SCHEDULE_STATUSES, default: 'ACTIVE' },
    scheduledAt: { type: Date, required: true },
    endsAt: Date,
    venue: { type: String, trim: true, default: '' },
    cancelledAt: Date,
    supersededAt: Date,
    completedAt: Date,
  },
  persistenceOptions,
);

caScheduleSchema.index(
  { applicationId: 1, incompleteCaId: 1 },
  { unique: true, name: 'unique_active_ca_schedule_per_subject', partialFilterExpression: { status: 'ACTIVE' } },
);
caScheduleSchema.index({ applicationId: 1, incompleteCaId: 1, generation: 1, status: 1 });
caScheduleSchema.index({ examNoticeId: 1, status: 1 });
caScheduleSchema.index({ subjectOfferingId: 1, lecturerUserId: 1 });
caScheduleSchema.index({ calendarEventId: 1 });
caScheduleSchema.index({ departmentId: 1, scheduledAt: 1, cancelledAt: 1 });

export const CaSchedule = defineModel('CaSchedule', caScheduleSchema);
