export const SESSION_MODES = Object.freeze(['AUTO', 'SUBJECT', 'FREE']);
export const SESSION_STATUSES = Object.freeze(['ACTIVE', 'ARCHIVED']);
export const MESSAGE_ROLES = Object.freeze(['student', 'agent']);

/** Where a statement came from. The UI labels each kind so students can tell them apart. */
export const SOURCE_KINDS = Object.freeze([
  'OFFICIAL',
  'SHARED',
  'UPLOAD',
  'WEB',
  'ACADEMIC_RECORD',
  'AI_KNOWLEDGE',
]);

export const INDEX_STATUSES = Object.freeze(['PENDING', 'INDEXED', 'FAILED', 'UNSUPPORTED']);

export const INDEXABLE_MIME_TYPES = Object.freeze(['application/pdf', 'text/plain']);

/** What a student may attach to a message. Checked against file content, not the declared type. */
export const ATTACHMENT_IMAGE_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
export const ATTACHMENT_TEXT_TYPE = 'text/plain';
export const ATTACHMENT_MIME_TYPES = Object.freeze([...ATTACHMENT_IMAGE_TYPES, 'application/pdf', ATTACHMENT_TEXT_TYPE]);
export const MAX_TEXT_ATTACHMENT_BYTES = 1024 * 1024;
export const MAX_UPLOADS_PER_SESSION = 50;
export const MAX_INLINE_BYTES = 18 * 1024 * 1024;
export const SUMMARY_EVERY_MESSAGES = 10;
export const MAX_WEB_CITATIONS = 8;

/** Follow-up modes. Research turns on web search; the rest shape the explanation. */
export const INTENTS = Object.freeze(['simpler', 'example', 'compare', 'tamil', 'research']);
export const FOLLOW_UP_INTENTS = Object.freeze(['simpler', 'example', 'compare', 'tamil']);

export const CHUNK_TARGET_CHARS = 1200;
export const CHUNK_OVERLAP_CHARS = 150;
export const MAX_INDEXED_CHUNKS_PER_FILE = 400;
export const MAX_SESSION_TITLE_CHARS = 80;
