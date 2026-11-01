import { CHUNK_OVERLAP_CHARS, CHUNK_TARGET_CHARS, MAX_INDEXED_CHUNKS_PER_FILE } from '../constants.js';

const NUMBERED_HEADING = /^(\d+(\.\d+){0,3}[.)]?|[ivxIVX]+\.|chapter\s+\d+|unit\s+\d+|topic\s+\d+|week\s+\d+|lecture\s+\d+|section\s+\d+)\s+\S/i;

/** A heading is a short line that is not a sentence: numbered, ALL CAPS, or Title Case. */
export function detectHeading(rawLine) {
  const line = String(rawLine || '').trim();
  if (line.length < 3 || line.length > 80) {
    return false;
  }
  if (/[.;,]$/.test(line)) {
    return false;
  }
  const words = line.split(/\s+/);
  if (words.length > 10) {
    return false;
  }
  if (NUMBERED_HEADING.test(line)) {
    return true;
  }
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase()) {
    return true;
  }
  const titleCased = words.filter((word) => /^[A-Z]/.test(word) || word.length <= 3).length === words.length;
  return words.length >= 2 && words.length <= 8 && titleCased && /^[A-Z]/.test(words[0]);
}

function overlapTail(text, overlap) {
  if (text.length <= overlap) {
    return text;
  }
  const tail = text.slice(-overlap);
  const space = tail.indexOf(' ');
  return space > 0 ? tail.slice(space + 1) : tail;
}

/**
 * Split extracted pages into retrieval chunks. Chunks never cross a page boundary,
 * so a page reference on a chunk is always exact.
 * @param {{ num: number, text: string }[]} pages
 */
export function chunkPages(pages, options = {}) {
  const target = options.target || CHUNK_TARGET_CHARS;
  const overlap = options.overlap ?? CHUNK_OVERLAP_CHARS;
  const max = options.max || MAX_INDEXED_CHUNKS_PER_FILE;
  const chunks = [];
  const headings = [];
  let heading = '';

  for (const page of pages) {
    let buffer = '';
    let hasNew = false;
    let bufferHeading = heading;

    const flush = () => {
      const text = buffer.replace(/\s+/g, ' ').trim();
      if (hasNew && text.replace(/\s/g, '').length >= 20 && chunks.length < max) {
        chunks.push({ page: page.num, heading: bufferHeading, text, ordinal: chunks.length });
      }
      return text;
    };

    for (const rawLine of String(page.text || '').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      if (detectHeading(line)) {
        flush();
        heading = line;
        if (!headings.includes(line) && headings.length < 60) {
          headings.push(line);
        }
        bufferHeading = heading;
        buffer = '';
        hasNew = false;
        continue;
      }
      buffer += `${line} `;
      hasNew = true;
      if (buffer.length >= target) {
        const flushed = flush();
        buffer = overlap > 0 ? `${overlapTail(flushed, overlap)} ` : '';
        hasNew = false;
      }
    }
    flush();
  }
  return { chunks, headings };
}
