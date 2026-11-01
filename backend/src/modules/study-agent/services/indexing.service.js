import { createHash } from 'node:crypto';
import { StoredFile } from '../../files/index.js';
import { JOB_NAMES } from '../../../infrastructure/queue/job-names.js';
import { DocumentChunk, DocumentIndex } from '../models/index.js';
import { INDEXABLE_MIME_TYPES } from '../constants.js';
import { chunkPages } from '../utils/chunker.js';

const INDEXABLE_DOMAINS = new Set(['OFFICIAL_RESOURCE', 'STUDY_ROOM_RESOURCE', 'STUDY_AGENT_UPLOAD']);

export async function extractPages({ buffer, mimeType }) {
  if (mimeType === 'text/plain') {
    return [{ num: 1, text: buffer.toString('utf8') }];
  }
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return (result?.pages || []).map((page) => ({ num: page.num, text: page.text || '' }));
  } finally {
    await parser.destroy?.();
  }
}

/**
 * Extract, chunk and store searchable text for one file. Only SAFE files are read.
 * A bad document is recorded as FAILED rather than retried forever.
 */
export async function indexFile({ fileId, infrastructure, logger }) {
  const file = await StoredFile.findById(fileId);
  if (!file || file.scanStatus !== 'SAFE') {
    return { status: 'SKIPPED' };
  }
  if (!INDEXABLE_MIME_TYPES.includes(file.mimeType)) {
    await DocumentIndex.findOneAndUpdate(
      { fileId: file._id },
      { status: 'UNSUPPORTED', chunkCount: 0, pageCount: 0, headings: [] },
      { upsert: true },
    );
    return { status: 'UNSUPPORTED' };
  }

  try {
    const { body } = await infrastructure.storage.getObject(file.storageKey);
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const existing = await DocumentIndex.findOne({ fileId: file._id });
    if (existing?.status === 'INDEXED' && existing.checksumSha256 === checksum) {
      return { status: 'INDEXED', reused: true };
    }
    const pages = await extractPages({ buffer, mimeType: file.mimeType });
    const { chunks, headings } = chunkPages(pages);
    await DocumentChunk.deleteMany({ fileId: file._id });
    if (chunks.length) {
      await DocumentChunk.insertMany(chunks.map((chunk) => ({ ...chunk, fileId: file._id })));
    }
    await DocumentIndex.findOneAndUpdate(
      { fileId: file._id },
      {
        status: chunks.length ? 'INDEXED' : 'FAILED',
        pageCount: pages.length,
        chunkCount: chunks.length,
        headings,
        checksumSha256: checksum,
        indexedAt: new Date(),
      },
      { upsert: true },
    );
    return { status: chunks.length ? 'INDEXED' : 'FAILED', chunks: chunks.length };
  } catch (error) {
    logger?.warn('Document indexing failed', { fileId: String(file._id), message: error.message });
    await DocumentIndex.findOneAndUpdate({ fileId: file._id }, { status: 'FAILED' }, { upsert: true });
    return { status: 'FAILED' };
  }
}

export async function enqueueIndex({ queue, fileId }) {
  await queue?.enqueue?.({
    name: JOB_NAMES.STUDY_AGENT_INDEX_DOCUMENT,
    payload: { fileId: String(fileId) },
    jobId: `study-agent-index:${fileId}`,
  });
}

/** Called by the worker once a malware scan finishes; only clean learning files are indexed. */
export async function enqueueIndexAfterScan({ queue, fileId }) {
  const file = await StoredFile.findById(fileId).select('scanStatus mimeType owningDomain');
  if (
    file &&
    file.scanStatus === 'SAFE' &&
    INDEXABLE_DOMAINS.has(file.owningDomain) &&
    INDEXABLE_MIME_TYPES.includes(file.mimeType)
  ) {
    await enqueueIndex({ queue, fileId });
    return true;
  }
  return false;
}

/**
 * Lazy backfill for files that were scanned before the agent existed.
 * Returns how many allowed files are not searchable yet.
 */
export async function ensureSourcesIndexed({ sources, queue }) {
  if (!sources.length) {
    return { pending: 0 };
  }
  const indexes = await DocumentIndex.find({ fileId: { $in: sources.map((item) => item.fileId) } }).select(
    'fileId status',
  );
  const state = new Map(indexes.map((item) => [String(item.fileId), item.status]));
  let pending = 0;
  for (const source of sources) {
    const status = state.get(source.fileId);
    if (!status || status === 'PENDING') {
      pending += 1;
      try {
        await enqueueIndex({ queue, fileId: source.fileId });
      } catch {
        // Queue trouble must not break tutoring; the file is retried on the next request.
      }
    }
  }
  return { pending };
}
