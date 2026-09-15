import { ECA_RESULT_CODE, DICT_GRADE_POINTS } from '../constants.js';

const REG_PATTERN = /SEU\/[A-Z]{2}\/\d{2}\/[A-Z]{2,5}\/\d{3,}/i;
const SUBJECT_PATTERN = /\b[A-Z]{3}\d{4}[A-Z]?\b/i;

export function normalizeRegistrationNumber(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

export function normalizeSubjectCode(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

export function normalizeResultCode(value) {
  const raw = String(value || '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
  if (!raw) {
    return '';
  }
  if (raw === 'E(CA)' || raw === 'ECA' || raw === 'E(CA.)' || raw === 'ECA)') {
    return ECA_RESULT_CODE;
  }
  if (raw.replace(/[()]/g, '') === 'ECA') {
    return ECA_RESULT_CODE;
  }
  const withParen = raw.replace('ECA', ECA_RESULT_CODE);
  if (withParen === ECA_RESULT_CODE) {
    return ECA_RESULT_CODE;
  }
  const compact = raw.replace('−', '-');
  return compact;
}

export function isKnownGrade(resultCode) {
  return Object.prototype.hasOwnProperty.call(DICT_GRADE_POINTS, resultCode);
}

export function looksLikeRegistrationNumber(value) {
  return REG_PATTERN.test(normalizeRegistrationNumber(value));
}

export function looksLikeSubjectCode(value) {
  return SUBJECT_PATTERN.test(normalizeSubjectCode(value));
}
