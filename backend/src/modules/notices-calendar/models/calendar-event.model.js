import mongoose from 'mongoose';
import { CALENDAR_EVENT_TYPES, CALENDAR_PUBLICATION_STATES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const calendarEventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    details: { type: String, trim: true },
    startsAt: { type: Date, required: true },
    endsAt: Date,
    timezone: { type: String, trim: true, default: 'Asia/Colombo' },
    allDay: { type: Boolean, default: false },
    createdByUserId: { type: objectId, ref: 'User', required: true },
    departmentId: { type: objectId, ref: 'Department' },
    eventType: {
      type: String,
      required: true,
      enum: CALENDAR_EVENT_TYPES,
    },
    publicationState: {
      type: String,
      required: true,
      enum: CALENDAR_PUBLICATION_STATES,
      default: 'PUBLISHED',
    },
    batchId: { type: objectId, ref: 'Batch' },
    academicYearId: { type: objectId, ref: 'AcademicYear' },
    semesterId: { type: objectId, ref: 'Semester' },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering' },
    sourceModule: { type: String, trim: true, default: 'notices-calendar' },
    sourceEntityId: { type: String, trim: true },
    reminderEnabled: { type: Boolean, default: false },
    reminderOffsetsHours: { type: [Number], default: undefined },
    reminderGeneration: { type: Number, required: true, default: 0 },
    cancelledAt: Date,
  },
  persistenceOptions,
);

calendarEventSchema.index({ startsAt: 1, eventType: 1 });
calendarEventSchema.index({ eventType: 1, cancelledAt: 1, startsAt: 1 });
calendarEventSchema.index({ subjectOfferingId: 1, startsAt: 1 });
calendarEventSchema.index({ batchId: 1, academicYearId: 1, semesterId: 1, startsAt: 1 });
calendarEventSchema.index({ departmentId: 1, startsAt: 1, publicationState: 1 });
calendarEventSchema.index({ sourceModule: 1, sourceEntityId: 1 });

calendarEventSchema.statics.activeFilter = function activeFilter(filter = {}) {
  return { ...filter, cancelledAt: null };
};

export const CalendarEvent = defineModel('CalendarEvent', calendarEventSchema);
