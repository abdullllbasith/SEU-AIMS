import { MAX_ARRAY_ITEMS, MAX_DEPTH, MAX_STRING_CHARS } from '../constants.js';

/**
 * Shrinks a service result so it fits in a prompt: long strings are cut, long lists are
 * capped (with a note saying how many were left out), and depth is bounded.
 * Always returns a fresh value, so cached service results are never mutated.
 */
export function compact(value, depth = 0) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value.length > MAX_STRING_CHARS ? `${value.slice(0, MAX_STRING_CHARS)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (depth >= MAX_DEPTH) {
    return '[nested data omitted]';
  }
  if (value instanceof Map) {
    return compact(Object.fromEntries(value), depth);
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => compact(item, depth + 1));
    return value.length > MAX_ARRAY_ITEMS
      ? { items, omitted: value.length - MAX_ARRAY_ITEMS, totalCount: value.length }
      : items;
  }
  if (typeof value.toJSON === 'function') {
    return compact(value.toJSON(), depth);
  }
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    if (typeof inner === 'function') {
      continue;
    }
    out[key] = compact(inner, depth + 1);
  }
  return out;
}

/** Serialises a compacted result and cuts it to a hard character budget. */
export function toBoundedJson(value, budget) {
  const text = JSON.stringify(compact(value));
  return text.length > budget ? `${text.slice(0, budget)}…[truncated]` : text;
}
