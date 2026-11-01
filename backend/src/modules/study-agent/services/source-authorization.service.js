import { OfficialResource, isStudentVisibleResource } from '../../learning-environment/index.js';
import { listStudentAvailableSharedResources } from '../../study-room/index.js';
import { StoredFile } from '../../files/index.js';
import { ForbiddenError } from '../../../shared/errors/app-error.js';
import { requireAccessibleOffering } from './subject-context.service.js';

async function officialSources(session, byFile) {
  const resources = await OfficialResource.find({
    subjectOfferingId: session.subjectOfferingId,
    publicationState: 'PUBLISHED',
    deletedAt: null,
  }).select('fileId title category publicationState deletedAt');
  const files = resources.length
    ? await StoredFile.find({ _id: { $in: resources.map((item) => item.fileId) } })
    : [];
  const fileById = new Map(files.map((file) => [String(file._id), file]));
  for (const resource of resources) {
    if (isStudentVisibleResource(resource, fileById.get(String(resource.fileId)))) {
      byFile.set(String(resource.fileId), {
        fileId: String(resource.fileId),
        kind: 'OFFICIAL',
        title: resource.title,
        category: resource.category,
      });
    }
  }
}

async function sharedSources(principal, byFile) {
  try {
    for (const item of await listStudentAvailableSharedResources(principal)) {
      if (!byFile.has(item.fileId)) {
        byFile.set(item.fileId, { fileId: item.fileId, kind: 'SHARED', title: item.title });
      }
    }
  } catch (error) {
    // Study Room disabled for the department: shared files are simply not a source.
    if (!(error instanceof ForbiddenError)) {
      throw error;
    }
  }
}

/** The student's own scanned PDFs uploaded into this very session. Never another session or student. */
async function uploadSources(principal, session, byFile) {
  const uploads = await StoredFile.find({
    uploadedByUserId: principal.userId,
    owningDomain: 'STUDY_AGENT_UPLOAD',
    owningContextId: session._id,
    scanStatus: 'SAFE',
    availability: 'AVAILABLE',
    mimeType: 'application/pdf',
  });
  for (const file of uploads) {
    byFile.set(String(file._id), { fileId: String(file._id), kind: 'UPLOAD', title: file.displayFilename });
  }
}

/**
 * The only place that decides which files may enter AI context.
 * Built fresh on every request from the same visibility rules students already face:
 * published + SAFE + available official resources of an offering they can access,
 * AVAILABLE + SAFE batch shared files, and their own clean uploads for this session.
 * Quarantined, unsafe, removed or unpublished files are never returned, even if they
 * were indexed earlier.
 * @returns {Promise<{ fileId: string, kind: 'OFFICIAL'|'SHARED'|'UPLOAD', title: string, category?: string }[]>}
 */
export async function resolveAllowedSources(principal, session) {
  const byFile = new Map();
  if (session.mode === 'SUBJECT') {
    await requireAccessibleOffering(principal, session.subjectOfferingId);
    await officialSources(session, byFile);
    await sharedSources(principal, byFile);
  }
  await uploadSources(principal, session, byFile);
  return [...byFile.values()];
}
