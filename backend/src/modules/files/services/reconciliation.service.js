import { createHash } from 'node:crypto';
import { User } from '../../authentication/models/user.model.js';
import { AppError, ValidationError } from '../../../shared/errors/app-error.js';
import { StoredFile } from '../models/stored-file.model.js';

function pushIssue(issues, issue, file, recommendedAction) {
  issues.push({
    issue,
    entity: 'StoredFile',
    entityId: String(file._id),
    recommendedAction,
  });
}

export async function reconcileStoredFiles(principal, { storage } = {}) {
  if (!principal?.departmentId) {
    throw new ValidationError('Department is not configured for this administrator');
  }
  if (!storage?.getObject) {
    throw new AppError('Stored files cannot be checked because object storage is not readable', {
      statusCode: 503,
      code: 'STORAGE_UNAVAILABLE',
    });
  }

  const users = await User.find({ departmentId: principal.departmentId }).select('_id').lean();
  const files = await StoredFile.find({ uploadedByUserId: { $in: users.map((user) => user._id) } })
    .select('storageKey sizeBytes checksumSha256 scanStatus availability')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
  const issues = [];

  for (const file of files) {
    let object;
    try {
      object = await storage.getObject(file.storageKey);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        pushIssue(
          issues,
          'METADATA_WITHOUT_OBJECT',
          file,
          'This file record has no stored object. This report does not delete the record.',
        );
        continue;
      }
      throw new AppError('Stored files cannot be checked because object storage is not readable', {
        statusCode: 503,
        code: 'STORAGE_UNAVAILABLE',
      });
    }

    const body = object?.body ?? Buffer.alloc(0);
    const size = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body);
    if (size !== file.sizeBytes) {
      pushIssue(
        issues,
        'SIZE_MISMATCH',
        file,
        'The stored object size does not match the file record. This report does not replace the object.',
      );
    }
    if (file.checksumSha256) {
      const hash = createHash('sha256').update(body).digest('hex');
      if (hash !== file.checksumSha256) {
        pushIssue(
          issues,
          'HASH_MISMATCH',
          file,
          'The stored object hash does not match the file record. This report does not replace the object.',
        );
      }
    }
    if (file.availability === 'AVAILABLE' && file.scanStatus !== 'SAFE') {
      pushIssue(
        issues,
        'AVAILABLE_WITHOUT_SAFE_SCAN',
        file,
        'This file is marked available without a safe scan. This report does not change availability.',
      );
    }
  }

  return {
    issues,
    issueCount: issues.length,
    note: 'This check compares file records with stored objects for this department. It does not delete objects, and it does not list storage keys. Objects with no file record are not listed, because storage has no list operation.',
  };
}
