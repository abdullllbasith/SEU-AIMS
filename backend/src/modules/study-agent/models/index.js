import mongoose from 'mongoose';
import { defineModel, objectId, persistenceOptions } from '../../../infrastructure/database/define-model.js';
import {
  INDEX_STATUSES,
  MESSAGE_ROLES,
  SESSION_MODES,
  SESSION_STATUSES,
  SOURCE_KINDS,
} from '../constants.js';

const studySessionSchema = new mongoose.Schema(
  {
    studentUserId: { type: objectId, ref: 'User', required: true },
    mode: { type: String, required: true, enum: SESSION_MODES },
    subjectOfferingId: { type: objectId, ref: 'SubjectOffering' },
    subjectCode: { type: String, trim: true, default: '' },
    subjectName: { type: String, trim: true, default: '' },
    title: { type: String, trim: true, maxlength: 120, default: 'New study session' },
    status: { type: String, required: true, enum: SESSION_STATUSES, default: 'ACTIVE' },
    rollingSummary: { type: String, default: '', maxlength: 4000 },
    messageCount: { type: Number, default: 0 },
    lastActivityAt: { type: Date, default: Date.now },
  },
  persistenceOptions,
);
studySessionSchema.index({ studentUserId: 1, status: 1, lastActivityAt: -1 });

const sourceSchema = new mongoose.Schema(
  {
    kind: { type: String, required: true, enum: SOURCE_KINDS },
    title: { type: String, trim: true, default: '' },
    fileId: { type: objectId, ref: 'StoredFile' },
    page: Number,
    section: { type: String, trim: true },
    url: { type: String, trim: true },
  },
  { _id: false },
);

const attachmentSchema = new mongoose.Schema(
  {
    fileId: { type: objectId, ref: 'StoredFile', required: true },
    name: { type: String, trim: true, default: '' },
    mimeType: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const routeSchema = new mongoose.Schema(
  {
    mode: { type: String, enum: ['SUBJECT', 'FREE'], required: true },
    subjectCode: { type: String, trim: true, default: '' },
    subjectName: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const studyMessageSchema = new mongoose.Schema(
  {
    sessionId: { type: objectId, ref: 'StudySession', required: true },
    studentUserId: { type: objectId, ref: 'User', required: true },
    role: { type: String, required: true, enum: MESSAGE_ROLES },
    content: { type: String, required: true },
    sources: { type: [sourceSchema], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
    route: { type: routeSchema, default: undefined },
    failed: { type: Boolean, default: false },
  },
  persistenceOptions,
);
studyMessageSchema.index({ sessionId: 1, _id: -1 });

const documentIndexSchema = new mongoose.Schema(
  {
    fileId: { type: objectId, ref: 'StoredFile', required: true },
    status: { type: String, required: true, enum: INDEX_STATUSES, default: 'PENDING' },
    pageCount: { type: Number, default: 0 },
    chunkCount: { type: Number, default: 0 },
    headings: { type: [String], default: [] },
    checksumSha256: { type: String, trim: true },
    indexedAt: Date,
  },
  persistenceOptions,
);
documentIndexSchema.index({ fileId: 1 }, { unique: true });

const documentChunkSchema = new mongoose.Schema(
  {
    fileId: { type: objectId, ref: 'StoredFile', required: true },
    page: { type: Number, default: 1 },
    heading: { type: String, default: '' },
    ordinal: { type: Number, required: true },
    text: { type: String, required: true },
  },
  persistenceOptions,
);
documentChunkSchema.index({ fileId: 1, ordinal: 1 });
documentChunkSchema.index({ heading: 'text', text: 'text' }, { weights: { heading: 5, text: 1 }, name: 'study_agent_chunk_text' });

const aiUsageSchema = new mongoose.Schema(
  {
    studentUserId: { type: objectId, ref: 'User', required: true },
    day: { type: String, required: true },
    requests: { type: Number, default: 0 },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
  },
  persistenceOptions,
);
aiUsageSchema.index({ studentUserId: 1, day: 1 }, { unique: true });

export const StudySession = defineModel('StudySession', studySessionSchema);
export const StudyMessage = defineModel('StudyMessage', studyMessageSchema);
export const DocumentIndex = defineModel('DocumentIndex', documentIndexSchema);
export const DocumentChunk = defineModel('DocumentChunk', documentChunkSchema);
export const AiUsage = defineModel('AiUsage', aiUsageSchema);
