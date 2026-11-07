import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

export const MEDICAL_ISSUER_CATEGORIES = Object.freeze([
  'GOVERNMENT_HOSPITAL',
  'UNIVERSITY_MEDICAL_OFFICER',
  'DISTRICT_MEDICAL_OFFICER',
  'CONSULTANT_SPECIALIST',
  'AYURVEDIC_PHYSICIAN_REGISTERED',
  'PRIVATE_PRACTITIONER_UMO_ENDORSED',
]);

/**
 * Medical claim for an absent attempt (handbook 4.3.2, 4.3.3). Late notice or a late document is
 * flagged for the Senate and never auto-rejected. Only an APPROVED decision makes the attempt
 * non-counted. Whether the rule also covers CA absences is not written in the handbook (assumption).
 */
const absenceClaimSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    attemptId: { type: objectId, ref: 'AssessmentAttempt', required: true },
    /** Written notice to the Assistant Registrar, due within 48 hours. */
    notifiedAt: { type: Date, required: true },
    /** Document due within two weeks of the last date of that semester's examination. */
    documentReceivedAt: { type: Date, default: null },
    issuerCategory: { type: String, enum: MEDICAL_ISSUER_CATEGORIES },
    noticeLate: { type: Boolean, default: false },
    documentLate: { type: Boolean, default: false },
    senateDecision: { type: String, enum: ['APPROVED', 'REJECTED'] },
    senateReference: { type: String, trim: true, default: '' },
    decidedAt: Date,
    decidedByUserId: { type: objectId, ref: 'User' },
    recordedByUserId: { type: objectId, ref: 'User', required: true },
  },
  persistenceOptions,
);

absenceClaimSchema.index({ attemptId: 1 });
absenceClaimSchema.index({ departmentId: 1, senateDecision: 1 });

export const AbsenceClaim = defineModel('AbsenceClaim', absenceClaimSchema);
