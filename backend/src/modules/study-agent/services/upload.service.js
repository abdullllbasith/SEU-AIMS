import { randomUUID } from 'node:crypto';
import { StoredFile, detectOfficialContentType, enqueueMalwareScan, sanitizeDisplayFilename } from '../../files/index.js';
import {
  PayloadTooLargeError,
  UnsupportedMediaError,
  ValidationError,
} from '../../../shared/errors/app-error.js';
import {
  ATTACHMENT_IMAGE_TYPES,
  ATTACHMENT_MIME_TYPES,
  ATTACHMENT_TEXT_TYPE,
  MAX_INLINE_BYTES,
  MAX_TEXT_ATTACHMENT_BYTES,
  MAX_UPLOADS_PER_SESSION,
} from '../constants.js';
import { conceal, requireObjectId } from '../utils/http.js';
import { requireAgentStudent } from './access.service.js';
import { loadOwnedSession } from './session.service.js';
import { assertMinuteLimit } from './usage.service.js';

const DOMAIN = 'STUDY_AGENT_UPLOAD';

function mapUpload(file) {
  return {
    id: String(file._id),
    name: file.displayFilename,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    status: uploadStatus(file),
  };
}

/**
 * SCANNING until the scan finished and the worker made the file available.
 * BLOCKED covers unsafe files and files nobody could verify (no scanner configured).
 */
export function uploadStatus(file) {
  if (file.scanStatus === 'SAFE' && file.availability === 'AVAILABLE') {
    return 'READY';
  }
  if (file.scanStatus === 'UPLOADED' || file.scanStatus === 'SCANNING' || file.scanStatus === 'SAFE') {
    return 'SCANNING';
  }
  return 'BLOCKED';
}

/** Owner-only lookup. Someone else's upload looks exactly like a missing one. */
async function loadOwnedUpload(principal, fileId) {
  requireObjectId(fileId, 'attachment');
  const file = await StoredFile.findOne({
    _id: fileId,
    uploadedByUserId: principal.userId,
    owningDomain: DOMAIN,
  });
  if (!file) {
    throw conceal('Attachment');
  }
  return file;
}

export async function uploadAttachments(principal, sessionId, files, { config, infrastructure }) {
  await requireAgentStudent(principal);
  const session = await loadOwnedSession(principal, sessionId);
  const settings = config.studyAgent;
  if (!Array.isArray(files) || !files.length) {
    throw new ValidationError('Choose at least one file');
  }
  if (files.length > settings.maxImages) {
    throw new ValidationError(`Attach at most ${settings.maxImages} files at a time`);
  }
  assertMinuteLimit(`upload:${principal.userId}`, { max: 20 });

  const existing = await StoredFile.countDocuments({ owningDomain: DOMAIN, owningContextId: session._id });
  if (existing + files.length > MAX_UPLOADS_PER_SESSION) {
    throw new ValidationError('This session has reached its attachment limit. Start a new session to add more.');
  }

  // Validate everything before storing anything, so a bad file never leaves half an upload behind.
  const prepared = files.map((file) => {
    const buffer = file.buffer;
    if (!buffer?.length) {
      throw new ValidationError('A selected file is empty');
    }
    const mimeType = detectOfficialContentType(buffer, file.mimetype);
    if (!ATTACHMENT_MIME_TYPES.includes(mimeType)) {
      throw new UnsupportedMediaError('Only JPEG, PNG, WebP images, PDF and plain text files can be attached');
    }
    if (mimeType === ATTACHMENT_TEXT_TYPE && buffer.includes(0)) {
      throw new UnsupportedMediaError('That file is not plain text');
    }
    let limit = config.files.maxBytes;
    if (ATTACHMENT_IMAGE_TYPES.includes(mimeType)) {
      limit = settings.imageMaxBytes;
    } else if (mimeType === ATTACHMENT_TEXT_TYPE) {
      limit = MAX_TEXT_ATTACHMENT_BYTES;
    }
    if (buffer.length > limit) {
      throw new PayloadTooLargeError('A selected file is too large');
    }
    return { buffer, mimeType, name: sanitizeDisplayFilename(file.originalname) };
  });

  const created = [];
  for (const item of prepared) {
    const storageKey = `study-agent/${principal.userId}/${randomUUID()}`;
    await infrastructure.storage.putObject({ key: storageKey, body: item.buffer, contentType: item.mimeType });
    const file = await StoredFile.create({
      storageKey,
      originalFilename: item.name,
      displayFilename: item.name,
      mimeType: item.mimeType,
      sizeBytes: item.buffer.length,
      uploadedByUserId: principal.userId,
      owningDomain: DOMAIN,
      owningContextId: session._id,
      scanStatus: 'SCANNING',
      availability: 'UNAVAILABLE',
    });
    await enqueueMalwareScan({ queue: infrastructure.queue, fileId: file._id });
    created.push(file);
  }
  return { items: created.map(mapUpload) };
}

export async function getAttachmentStatus(principal, fileId) {
  await requireAgentStudent(principal);
  return mapUpload(await loadOwnedUpload(principal, fileId));
}

/** Withdraw an attachment that has not been sent. The stored object is kept; it just stops being usable. */
export async function removeAttachment(principal, fileId) {
  await requireAgentStudent(principal);
  const file = await loadOwnedUpload(principal, fileId);
  file.availability = 'UNAVAILABLE';
  await file.save();
  return { removed: true };
}

export async function loadAttachmentContent(principal, fileId, { infrastructure }) {
  await requireAgentStudent(principal);
  const file = await loadOwnedUpload(principal, fileId);
  if (uploadStatus(file) !== 'READY') {
    throw conceal('Attachment');
  }
  const { body } = await infrastructure.storage.getObject(file.storageKey);
  return { body, mimeType: file.mimeType, name: file.displayFilename };
}

/**
 * Attachments a message may use: the student's own, uploaded for this session, scanned clean.
 * Anything else fails the whole message rather than silently dropping a file.
 */
export async function resolveReadyAttachments(principal, session, attachmentIds, { maxFiles }) {
  if (attachmentIds === undefined || attachmentIds === null) {
    return [];
  }
  if (!Array.isArray(attachmentIds) || attachmentIds.some((id) => typeof id !== 'string')) {
    throw new ValidationError('attachmentIds must be a list of ids');
  }
  const unique = [...new Set(attachmentIds)];
  if (unique.length > maxFiles) {
    throw new ValidationError(`Attach at most ${maxFiles} files to one message`);
  }
  const files = [];
  for (const id of unique) {
    const file = await loadOwnedUpload(principal, id);
    if (String(file.owningContextId) !== String(session._id)) {
      throw conceal('Attachment');
    }
    if (uploadStatus(file) !== 'READY') {
      throw new ValidationError(`${file.displayFilename} is not ready to use yet`);
    }
    files.push(file);
  }
  return files;
}

/** Reads the bytes of ready attachments as provider parts, within a total size budget. */
export async function loadInlineParts(files, { infrastructure }) {
  const total = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  if (total > MAX_INLINE_BYTES) {
    throw new PayloadTooLargeError('The attached files are too large to send together');
  }
  const parts = [];
  for (const file of files) {
    const { body } = await infrastructure.storage.getObject(file.storageKey);
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    parts.push({ mimeType: file.mimeType, data: buffer.toString('base64') });
  }
  return parts;
}

/** Called by the worker after a scan: a clean upload becomes available to its owner. */
export async function syncUploadAfterScan(fileId) {
  const file = await StoredFile.findById(fileId);
  if (!file || file.owningDomain !== DOMAIN) {
    return false;
  }
  if (file.scanStatus === 'SAFE' && file.availability !== 'AVAILABLE') {
    file.availability = 'AVAILABLE';
    await file.save();
    return true;
  }
  return false;
}
