import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

export const BOARD_SCOPES = Object.freeze([
  'GRADE_PUBLICATION',
  'GRADE_OVERRIDE',
  'CAP_DECISION',
  'CORRECTION',
  'ATTEMPT_VOID',
  'GRACE_CHANCE',
]);

/**
 * A recorded Board or Senate reference. Append-only: there is no update or delete path.
 * The system links the reference. It cannot verify that the Board met. The administrator attests it.
 */
const boardAuthorizationSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    scope: { type: String, required: true, enum: BOARD_SCOPES },
    reference: { type: String, required: true, trim: true, maxlength: 200 },
    meetingDate: { type: Date, required: true },
    decisionText: { type: String, trim: true, default: '', maxlength: 2000 },
    /** For GRADE_OVERRIDE and CORRECTION: the exact code the Board authorized. */
    authorizedResultCode: { type: String, trim: true, default: '' },
    coveredAttemptIds: { type: [objectId], default: [] },
    resultId: { type: objectId, ref: 'AcademicResult' },
    recordedByUserId: { type: objectId, ref: 'User', required: true },
    /** Set when the marks it was given for change. The row stays; it no longer counts for publishing. */
    invalidatedAt: { type: Date, default: null },
    invalidatedReason: { type: String, trim: true, default: '' },
  },
  persistenceOptions,
);

boardAuthorizationSchema.index({ departmentId: 1, scope: 1, createdAt: -1 });
boardAuthorizationSchema.index({ coveredAttemptIds: 1 });

export const BoardAuthorization = defineModel('BoardAuthorization', boardAuthorizationSchema);
