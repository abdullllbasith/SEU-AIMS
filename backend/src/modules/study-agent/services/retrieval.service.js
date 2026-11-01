import mongoose from 'mongoose';
import { DocumentChunk } from '../models/index.js';

/** Strip Mongo $text operators so student input is only ever treated as search words. */
export function sanitizeSearchQuery(query) {
  return String(query || '')
    .replace(/["\\]/g, ' ')
    .replace(/(^|\s)-+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/**
 * Keyword retrieval restricted to an authorised file set.
 * @param {{ query: string, sources: { fileId: string, kind: string, title: string }[], topK: number, charBudget: number }} input
 */
export async function retrieveChunks({ query, sources, topK = 6, charBudget = 8000 }) {
  const search = sanitizeSearchQuery(query);
  if (!search || !sources.length) {
    return [];
  }
  const byFile = new Map(sources.map((source) => [source.fileId, source]));
  const rows = await DocumentChunk.find(
    {
      fileId: { $in: sources.map((source) => new mongoose.Types.ObjectId(source.fileId)) },
      $text: { $search: search },
    },
    { score: { $meta: 'textScore' } },
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(topK);

  const picked = [];
  let used = 0;
  for (const row of rows) {
    const source = byFile.get(String(row.fileId));
    if (!source) {
      continue;
    }
    if (used + row.text.length > charBudget && picked.length) {
      break;
    }
    used += row.text.length;
    picked.push({
      fileId: String(row.fileId),
      kind: source.kind,
      title: source.title,
      page: row.page,
      heading: row.heading || '',
      text: row.text,
    });
  }
  return picked;
}
