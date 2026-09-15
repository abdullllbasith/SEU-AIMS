import mongoose from 'mongoose';
import { ROLE_VALUES } from '../../../shared/constants/roles.js';
import { NOTICE_PRIORITIES, NOTICE_STATES, NOTICE_TARGET_KINDS } from '../constants.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const noticeSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    publisherUserId: { type: objectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    publicationState: { type: String, enum: NOTICE_STATES, default: 'DRAFT' },
    priority: { type: String, enum: NOTICE_PRIORITIES, default: 'NORMAL' },
    publishedAt: Date,
    expiresAt: Date,
    archivedAt: Date,
    retractedAt: Date,
    targeting: {
      kind: { type: String, required: true, enum: NOTICE_TARGET_KINDS },
      batchId: { type: objectId, ref: 'Batch' },
      academicYearId: { type: objectId, ref: 'AcademicYear' },
      semesterId: { type: objectId, ref: 'Semester' },
      subjectId: { type: objectId, ref: 'Subject' },
      role: { type: String, enum: ROLE_VALUES },
    },
  },
  persistenceOptions,
);

noticeSchema.index({ departmentId: 1, publicationState: 1, publishedAt: -1 });
noticeSchema.index({ publicationState: 1, publishedAt: 1 });
noticeSchema.index({ 'targeting.kind': 1, 'targeting.batchId': 1 });
noticeSchema.index({ departmentId: 1, expiresAt: 1 });

export const Notice = defineModel('Notice', noticeSchema);
