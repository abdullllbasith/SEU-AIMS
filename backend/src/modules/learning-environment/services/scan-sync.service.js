import { OfficialResource } from '../models/index.js';
import { StoredFile } from '../../files/index.js';

/**
 * After a scan job, official resources stay unpublished unless a lecturer publishes.
 * This only confirms the StoredFile row is the source of scan state.
 */
export async function syncOfficialResourceAfterScan(fileId) {
  if (!fileId) {
    return { matched: 0 };
  }
  const file = await StoredFile.findById(fileId);
  if (!file) {
    return { matched: 0 };
  }
  const matched = await OfficialResource.countDocuments({
    $or: [{ fileId }, { previousFileId: fileId }],
  });
  return { matched, scanStatus: file.scanStatus };
}
