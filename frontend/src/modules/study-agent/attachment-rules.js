/** Client-side mirror of the server's attachment limits. The server remains the authority. */
export const TEXT_TYPE = 'text/plain';
export const ALLOWED_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', TEXT_TYPE]);
/** Value for the file picker's accept attribute; includes extensions because browsers report .md inconsistently. */
export const ACCEPT_ATTRIBUTE = [...ALLOWED_TYPES, '.txt', '.md'].join(',');
export const MAX_FILES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_BYTES = 1024 * 1024;

function megabytes(bytes) {
  return Math.round(bytes / (1024 * 1024));
}

/** The type the server will see. Text and Markdown files are sent as plain text. */
export function effectiveType(file) {
  if (/\.(txt|md|markdown)$/i.test(file.name || '') && (!file.type || file.type.startsWith('text/'))) {
    return TEXT_TYPE;
  }
  return file.type === 'text/markdown' ? TEXT_TYPE : file.type;
}

export function isImageType(type) {
  return typeof type === 'string' && type.startsWith('image/');
}

function limitFor(type) {
  if (type === 'application/pdf') {
    return MAX_PDF_BYTES;
  }
  return type === TEXT_TYPE ? MAX_TEXT_BYTES : MAX_IMAGE_BYTES;
}

function sizeLabel(bytes) {
  return bytes >= 1024 * 1024 ? `${megabytes(bytes)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/**
 * Splits a selection into files that may be uploaded and human-readable reasons for the rest.
 * @param {number} existingCount attachments already in the tray
 * @param {File[]} files
 */
export function checkFiles(existingCount, files) {
  const accepted = [];
  const problems = [];
  for (const file of files) {
    const type = effectiveType(file);
    if (!ALLOWED_TYPES.includes(type)) {
      problems.push(`${file.name} is not an image, PDF or text file.`);
    } else if (file.size === 0) {
      problems.push(`${file.name} is empty.`);
    } else if (file.size > limitFor(type)) {
      problems.push(`${file.name} is larger than ${sizeLabel(limitFor(type))}.`);
    } else if (existingCount + accepted.length >= MAX_FILES) {
      problems.push(`You can attach at most ${MAX_FILES} files to one message.`);
    } else {
      accepted.push(file);
    }
  }
  return { accepted, problems: [...new Set(problems)] };
}
