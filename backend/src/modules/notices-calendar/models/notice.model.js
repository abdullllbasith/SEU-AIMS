import mongoose from 'mongoose';
import { ROLE_VALUES } from '../../../shared/constants/roles.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const TARGET_TYPES = ['ALL_STUDENTS', 'BATCH', 'ACADEMIC_YEAR', 'SEMESTER', 'SUBJECT', 'ROLE'];

const noticeSchema = new mongoose.Schema(
  {
    publisherUserId: { type: objectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    publicationState: { type: String, enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT' },
    publishedAt: Date,
    targeting: {
      kind: { type: String, required: true, enum: TARGET_TYPES },
      batchId: { type: objectId, ref: 'Batch' },
      academicYearId: { type: objectId, ref: 'AcademicYear' },
      semesterId: { type: objectId, ref: 'Semester' },
      subjectId: { type: objectId, ref: 'Subject' },
      role: { type: String, enum: ROLE_VALUES },
    },
  },
  persistenceOptions,
);

noticeSchema.index({ publicationState: 1, publishedAt: 1 });
noticeSchema.index({ 'targeting.kind': 1, 'targeting.batchId': 1 });

export const Notice = defineModel('Notice', noticeSchema);
