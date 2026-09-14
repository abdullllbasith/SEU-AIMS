import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const calendarEventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    details: { type: String, trim: true },
    startsAt: { type: Date, required: true },
    endsAt: Date,
    createdByUserId: { type: objectId, ref: 'User', required: true },
    eventType: {
      type: String,
      required: true,
      enum: ['DEPARTMENT', 'ASSIGNMENT_DEADLINE', 'CA_SCHEDULE', 'OTHER'],
    },
    batchId: { type: objectId, ref: 'Batch' },
    academicYearId: { type: objectId, ref: 'AcademicYear' },
    semesterId: { type: objectId, ref: 'Semester' },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering' },
    reminderEnabled: { type: Boolean, default: false },
  },
  persistenceOptions,
);

calendarEventSchema.index({ startsAt: 1, eventType: 1 });
calendarEventSchema.index({ subjectOfferingId: 1, startsAt: 1 });
calendarEventSchema.index({ batchId: 1, academicYearId: 1, semesterId: 1, startsAt: 1 });

export const CalendarEvent = defineModel('CalendarEvent', calendarEventSchema);
