import mongoose from 'mongoose';
import { CA_EXAM_NOTICE_STATUSES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const historySchema = new mongoose.Schema(
  {
    generation: { type: Number, required: true },
    action: { type: String, required: true, enum: ['PUBLISHED', 'RESCHEDULED', 'CANCELLED'] },
    scheduledAt: Date,
    endsAt: Date,
    venue: { type: String, trim: true, default: '' },
    actorUserId: { type: objectId, ref: 'User', required: true },
    reason: { type: String, trim: true, default: '' },
    at: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

/** One CA examination notice for one subject offering. Cancelled notices are kept as history. */
const caExamNoticeSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering', required: true },
    subjectId: { type: objectId, ref: 'Subject', required: true },
    lecturerUserId: { type: objectId, ref: 'User', required: true },
    calendarEventId: { type: objectId, ref: 'CalendarEvent', required: true },
    scheduledAt: { type: Date, required: true },
    endsAt: Date,
    venue: { type: String, trim: true, required: true },
    timezone: { type: String, trim: true, default: 'Asia/Colombo' },
    status: { type: String, required: true, enum: CA_EXAM_NOTICE_STATUSES, default: 'PUBLISHED' },
    generation: { type: Number, required: true, default: 1 },
    cancelledAt: Date,
    cancelledByUserId: { type: objectId, ref: 'User' },
    cancelReason: { type: String, trim: true, default: '' },
    history: { type: [historySchema], default: [] },
  },
  persistenceOptions,
);

caExamNoticeSchema.index(
  { subjectOfferingId: 1 },
  { unique: true, name: 'unique_published_ca_notice_per_offering', partialFilterExpression: { status: 'PUBLISHED' } },
);
caExamNoticeSchema.index({ lecturerUserId: 1, status: 1, scheduledAt: 1 });
caExamNoticeSchema.index({ calendarEventId: 1 });

export const CaExamNotice = defineModel('CaExamNotice', caExamNoticeSchema);
