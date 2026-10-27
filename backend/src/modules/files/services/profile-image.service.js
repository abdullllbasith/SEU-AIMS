import { randomUUID, createHash } from 'node:crypto';
import { StoredFile } from '../models/stored-file.model.js';
import { PROFILE_IMAGE_MAX_BYTES } from '../constants.js';
import { detectProfileImageType, sanitizeDisplayFilename } from './content-inspection.js';
import { enqueueMalwareScan, processMalwareScan } from './scan.service.js';
import { PayloadTooLargeError, ValidationError, NotFoundError, ForbiddenError } from '../../../shared/errors/app-error.js';

export async function storeProfileImage({ buffer, originalname, principal, infrastructure }) {
  if (!buffer || !buffer.length) {
    throw new ValidationError('File is required');
  }
  if (buffer.length > PROFILE_IMAGE_MAX_BYTES) {
    throw new PayloadTooLargeError('Profile image exceeds the 2 MB limit');
  }
  const displayFilename = sanitizeDisplayFilename(originalname);
  const detectedType = detectProfileImageType(buffer);
  const storageKey = `profile/${principal.userId}/${randomUUID()}`;
  const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
  if (!infrastructure.storage?.putObject) {
    throw new ValidationError('File storage is not configured');
  }
  await infrastructure.storage.putObject({ key: storageKey, body: buffer, contentType: detectedType });
  const file = await StoredFile.create({
    storageKey,
    originalFilename: displayFilename,
    displayFilename,
    mimeType: detectedType,
    sizeBytes: buffer.length,
    uploadedByUserId: principal.userId,
    owningDomain: 'PROFILE_IMAGE',
    owningContextId: principal.userId,
    scanStatus: 'SCANNING',
    reviewStatus: 'NOT_REQUIRED',
    availability: 'UNAVAILABLE',
    checksumSha256,
  });
  await enqueueMalwareScan({ queue: infrastructure.queue, fileId: file._id });
  if (infrastructure.malwareScanner) {
    await processMalwareScan({
      fileId: file._id,
      scanner: infrastructure.malwareScanner,
      logger: infrastructure.logger,
    });
  }
  const scanned = await StoredFile.findById(file._id);
  if (scanned.scanStatus === 'SAFE') {
    scanned.availability = 'AVAILABLE';
    await scanned.save();
  }
  return scanned;
}

export async function loadAuthorizedProfileImage({ principal, fileId, infrastructure }) {
  const file = await StoredFile.findById(fileId);
  if (!file || file.owningDomain !== 'PROFILE_IMAGE' || file.availability !== 'AVAILABLE' || file.scanStatus !== 'SAFE') {
    throw new NotFoundError('Profile image not found');
  }
  if (String(file.uploadedByUserId) !== String(principal.userId)) {
    throw new ForbiddenError('Forbidden');
  }
  if (!infrastructure.storage?.getObject) {
    throw new ValidationError('File storage is not configured');
  }
  const object = await infrastructure.storage.getObject(file.storageKey);
  return { file, body: object?.body || Buffer.from('') };
}
