import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const resourceSectionSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering', required: true },
    name: { type: String, required: true, trim: true },
    sortOrder: { type: Number, required: true, default: 0 },
  },
  persistenceOptions,
);

resourceSectionSchema.index({ subjectOfferingId: 1, name: 1 }, { unique: true });
resourceSectionSchema.index({ subjectOfferingId: 1, sortOrder: 1 });

export const ResourceSection = defineModel('ResourceSection', resourceSectionSchema);
