import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const gpaSnapshotSchema = new mongoose.Schema(
  {
    studentUserId: { type: objectId, ref: 'User', required: true },
    scope: { type: String, required: true, enum: ['SEMESTER', 'CUMULATIVE'] },
    academicYearId: { type: objectId, ref: 'AcademicYear' },
    semesterId: { type: objectId, ref: 'Semester' },
    value: { type: Number },
    status: { type: String, required: true, enum: ['CURRENT', 'STALE', 'UNAVAILABLE', 'FAILED'], default: 'STALE' },
    calculationVersion: { type: String, trim: true },
    inputResultVersions: [
      {
        resultId: { type: String, trim: true },
        version: { type: Number },
        subjectCode: { type: String, trim: true },
      },
    ],
    excluded: [
      {
        subjectCode: { type: String, trim: true },
        resultCode: { type: String, trim: true },
        reason: { type: String, trim: true },
      },
    ],
    credits: { type: Number, default: 0 },
    qualityPoints: { type: Number, default: 0 },
    classification: { type: String, trim: true },
    engine: { type: String, required: true, default: 'DICT-SEUSL-GPA-Calculator' },
    calculatedAt: { type: Date, required: true, default: Date.now },
    inputFingerprint: { type: String, trim: true },
  },
  persistenceOptions,
);

gpaSnapshotSchema.index(
  { studentUserId: 1, scope: 1, academicYearId: 1, semesterId: 1 },
  { unique: true },
);

export const GpaSnapshot = defineModel('GpaSnapshot', gpaSnapshotSchema);
