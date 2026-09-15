import mongoose from 'mongoose';
import { ROLE_VALUES } from '../../../shared/constants/roles.js';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';

export const ACCOUNT_STATUSES = Object.freeze(['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']);

const userSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      required: true,
      enum: ROLE_VALUES,
    },
    accountStatus: {
      type: String,
      required: true,
      enum: ACCOUNT_STATUSES,
      default: 'PENDING',
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      select: false,
    },
    displayName: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    whatsappNumber: {
      type: String,
      trim: true,
      default: '',
    },
    profileImageFileId: {
      type: objectId,
      ref: 'StoredFile',
    },
    profileRevision: {
      type: Number,
      required: true,
      default: 0,
    },
    departmentId: {
      type: objectId,
      ref: 'Department',
    },
    authVersion: {
      type: Number,
      required: true,
      default: 0,
    },
    lecturerStatus: {
      type: String,
      enum: ['NOT_APPLICABLE', 'UNVERIFIED', 'VERIFIED', 'SUSPENDED'],
      default: 'NOT_APPLICABLE',
    },
  },
  persistenceOptions,
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, accountStatus: 1 });
userSchema.index({ departmentId: 1, role: 1 });

export const User = defineModel('User', userSchema);
