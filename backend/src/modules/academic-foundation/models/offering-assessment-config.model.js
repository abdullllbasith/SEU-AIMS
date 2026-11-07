import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const componentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, enum: ['CA', 'ESA'] },
    applicable: { type: Boolean, required: true },
    weight: { type: Number, default: null, min: 0, max: 100 },
    passMark: { type: Number, default: null, min: 0, max: 100 },
  },
  { _id: false },
);

/**
 * Versioned CA/ESA weights for one subject offering. A version is never edited once it has
 * been used for marks: a change creates a new version, so earlier results keep their weights.
 * Nothing in the current GPA or CA flow reads this collection.
 */
const offeringAssessmentConfigSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering', required: true },
    version: { type: Number, required: true, min: 1 },
    components: { type: [componentSchema], required: true },
    /** Where the weights came from. HANDBOOK_TEMPLATE rows come from assessment-schemes.json. */
    source: { type: String, required: true, enum: ['HANDBOOK_TEMPLATE', 'MANUAL'] },
    /** Handbook edition or approval reference. Empty when not yet confirmed (open question A5). */
    approvalReference: { type: String, trim: true, default: '' },
    /** Set when the first marks use this version. A locked version is immutable. */
    lockedAt: { type: Date, default: null },
    createdByUserId: { type: objectId, ref: 'User' },
  },
  persistenceOptions,
);

offeringAssessmentConfigSchema.index({ subjectOfferingId: 1, version: 1 }, { unique: true });
offeringAssessmentConfigSchema.index({ departmentId: 1, subjectOfferingId: 1 });

export const OfferingAssessmentConfig = defineModel('OfferingAssessmentConfig', offeringAssessmentConfigSchema);
