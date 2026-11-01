import { SharedResource } from '../models/index.js';
import { StoredFile } from '../../files/index.js';
import { requireStudentScope } from './access.service.js';
import { isStudentDownloadable } from '../policies/study-room.policies.js';

/**
 * Read-only view of the batch shared files a student may already download.
 * Chat content is end-to-end encrypted and is never exposed here.
 */
export async function listStudentAvailableSharedResources(principal) {
  const { context } = await requireStudentScope(principal);
  const resources = await SharedResource.find({
    departmentId: context.departmentId,
    batchId: context.batchId,
    moderationState: 'AVAILABLE',
    deletedAt: null,
  }).select('fileId title moderationState deletedAt');
  if (!resources.length) {
    return [];
  }
  const files = await StoredFile.find({ _id: { $in: resources.map((item) => item.fileId) } });
  const byId = new Map(files.map((file) => [String(file._id), file]));
  return resources
    .filter((resource) => isStudentDownloadable(resource, byId.get(String(resource.fileId))))
    .map((resource) => {
      const file = byId.get(String(resource.fileId));
      return {
        resourceId: String(resource._id),
        fileId: String(resource.fileId),
        title: resource.title || file.displayFilename,
        mimeType: file.mimeType,
      };
    });
}
