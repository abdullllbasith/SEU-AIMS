import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

const lecturerAssignmentSchema = new mongoose.Schema(
  {
    departmentId: { type: objectId, ref: 'Department', required: true },
    lecturerUserId: { type: objectId, ref: 'User', required: true },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering', required: true },
    assignedByUserId: { type: objectId, ref: 'User', required: true },
    assignedAt: { type: Date, required: true, default: Date.now },
    revokedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  persistenceOptions,
);

lecturerAssignmentSchema.index({ lecturerUserId: 1, subjectOfferingId: 1 }, { unique: true });
lecturerAssignmentSchema.index({ subjectOfferingId: 1, isActive: 1 });
lecturerAssignmentSchema.index({ lecturerUserId: 1, isActive: 1 });
lecturerAssignmentSchema.index({ departmentId: 1, isActive: 1 });

export const LecturerAssignment = defineModel('LecturerAssignment', lecturerAssignmentSchema);
