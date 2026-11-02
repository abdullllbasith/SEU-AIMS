import { StoredFile } from '../models/stored-file.model.js';
import { JOB_NAMES } from '../../../infrastructure/queue/job-names.js';

export async function processMalwareScan({ fileId, scanner, logger }) {
  const file = await StoredFile.findById(fileId);
  if (!file) {
    logger?.warn('Malware scan skipped; file not found', { fileId: String(fileId) });
    return null;
  }

  if (file.scanStatus === 'SAFE' || file.scanStatus === 'UNSAFE') {
    return file;
  }

  const result = await scanner.scan({ key: file.storageKey, fileId: String(file._id) });
  if (result?.clean === true) {
    file.scanStatus = 'SAFE';
  } else if (result?.status === 'not_configured' || result?.status === 'scan_failed') {
    // Fail closed. A scan_failed file is not marked unsafe, so a later scan can still clear it.
    file.scanStatus = 'QUARANTINED';
  } else {
    file.scanStatus = 'UNSAFE';
  }
  file.availability = 'UNAVAILABLE';
  await file.save();
  logger?.info('Malware scan recorded', {
    fileId: String(file._id),
    scanStatus: file.scanStatus,
  });
  return file;
}

export async function enqueueMalwareScan({ queue, fileId, logger }) {
  if (!queue?.enqueue) {
    return;
  }
  await queue.enqueue({
    name: JOB_NAMES.FILE_MALWARE_SCAN,
    payload: { fileId: String(fileId) },
    jobId: `scan:${fileId}`,
  });
  logger?.debug('Malware scan job enqueued', { fileId: String(fileId) });
}
