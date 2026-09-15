import { ALLOWED_OFFICIAL_MIME_TYPES } from '../constants.js';
import { UnsupportedMediaError } from '../../../shared/errors/app-error.js';

export function sanitizeDisplayFilename(name) {
  const base = String(name || 'document')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/\0/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .trim();
  const clipped = base.slice(0, 180) || 'document';
  if (/\.(exe|bat|cmd|js|msi|scr|com|dll)$/i.test(clipped)) {
    throw new UnsupportedMediaError('Executable filenames are not allowed');
  }
  return clipped;
}

export function detectOfficialContentType(buffer, declaredType) {
  const header = buffer.subarray(0, 16);
  const asString = header.toString('latin1');

  if (header[0] === 0x4d && header[1] === 0x5a) {
    throw new UnsupportedMediaError('Executable content is not allowed');
  }
  if (asString.startsWith('%PDF')) {
    return 'application/pdf';
  }
  if (header[0] === 0x89 && asString.includes('PNG')) {
    return 'image/png';
  }
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'image/jpeg';
  }
  if (asString.startsWith('RIFF') && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  if (asString.startsWith('ID3') || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0)) {
    return 'audio/mpeg';
  }
  if (asString.startsWith('PK')) {
    const officeTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (officeTypes.includes(declaredType)) {
      return declaredType;
    }
    throw new UnsupportedMediaError('Archive files are not allowed as official resources');
  }

  if (declaredType === 'text/plain') {
    return 'text/plain';
  }

  throw new UnsupportedMediaError('Unsupported official resource type');
}

export function assertAllowedOfficialType(detectedType) {
  if (!ALLOWED_OFFICIAL_MIME_TYPES.includes(detectedType)) {
    throw new UnsupportedMediaError('Unsupported official resource type');
  }
}

export function detectResultImportContentType(buffer, declaredType) {
  const header = buffer.subarray(0, 16);
  const asString = header.toString('latin1');
  if (header[0] === 0x4d && header[1] === 0x5a) {
    throw new UnsupportedMediaError('Executable content is not allowed');
  }
  if (asString.startsWith('%PDF')) {
    return 'application/pdf';
  }
  if (asString.startsWith('PK')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  throw new UnsupportedMediaError('Result imports must be PDF or XLSX');
}

export function assertAllowedResultImportType(detectedType) {
  if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(detectedType)) {
    throw new UnsupportedMediaError('Result imports must be PDF or XLSX');
  }
}

export function detectProfileImageType(buffer) {
  const header = buffer.subarray(0, 16);
  const asString = header.toString('latin1');
  if (header[0] === 0x4d && header[1] === 0x5a) {
    throw new UnsupportedMediaError('Executable content is not allowed');
  }
  if (header[0] === 0x89 && asString.includes('PNG')) {
    return 'image/png';
  }
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'image/jpeg';
  }
  if (asString.startsWith('RIFF') && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  throw new UnsupportedMediaError('Profile images must be JPEG, PNG, or WebP');
}
