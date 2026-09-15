import mongoose from 'mongoose';
import { REPORT_CATEGORIES, REPORT_STATUSES } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const resourceReportSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    reporterUserId: { type: objectId, ref: 'User', required: true },
    targetType: { type: String, required: true, enum: ['FOLDER', 'RESOURCE'] },
    targetId: { type: objectId, required: true },
    category: { type: String, required: true, enum: REPORT_CATEGORIES },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    status: { type: String, required: true, enum: REPORT_STATUSES, default: 'OPEN' },
    resolvedByUserId: { type: objectId, ref: 'User' },
    resolvedAt: Date,
    resolutionNote: { type: String, trim: true, maxlength: 500, default: '' },
  },
  persistenceOptions,
);

resourceReportSchema.index({ departmentId: 1, status: 1, createdAt: 1 });
resourceReportSchema.index({ targetType: 1, targetId: 1 });

export const ResourceReport = defineModel('ResourceReport', resourceReportSchema);
