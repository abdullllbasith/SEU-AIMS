import mongoose from 'mongoose';
import { PUBLICATION_STATES, RESOURCE_CATEGORIES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const officialResourceSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering', required: true },
    sectionId: { type: objectId, ref: 'ResourceSection', required: true },
    createdByUserId: { type: objectId, ref: 'User', required: true },
    updatedByUserId: { type: objectId, ref: 'User' },
    publishedByUserId: { type: objectId, ref: 'User' },
    fileId: { type: objectId, ref: 'StoredFile', required: true },
    previousFileId: { type: objectId, ref: 'StoredFile' },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, default: '', maxlength: 2000 },
    category: { type: String, required: true, enum: RESOURCE_CATEGORIES, default: 'OTHER' },
    publicationState: {
      type: String,
      required: true,
      enum: PUBLICATION_STATES,
      default: 'DRAFT',
    },
    sortOrder: { type: Number, required: true, default: 0 },
    version: { type: Number, required: true, default: 1 },
    deadlineAt: Date,
    calendarEventId: { type: objectId, ref: 'CalendarEvent' },
    publishedAt: Date,
    unpublishedAt: Date,
    deletedAt: Date,
  },
  persistenceOptions,
);

officialResourceSchema.index({ subjectOfferingId: 1, publicationState: 1, deletedAt: 1 });
officialResourceSchema.index({ sectionId: 1, sortOrder: 1 });
officialResourceSchema.index({ fileId: 1 });
officialResourceSchema.index({ departmentId: 1, publicationState: 1 });
officialResourceSchema.index({ createdByUserId: 1 });

export const OfficialResource = defineModel('OfficialResource', officialResourceSchema);
