import {
  ABSENT_RESULT_CODE,
  CA_AND_ESA_INCOMPLETE_RESULT_CODE,
  DICT_GRADE_POINTS,
  ECA_RESULT_CODE,
  ESA_INCOMPLETE_RESULT_CODE,
  RECOGNIZED_NON_GRADE_RESULTS,
} from '../constants.js';

const REG_PATTERN = /SEU\/[A-Z]{2}\/\d{2}\/[A-Z]{2,5}\/\d{3,}/i;
// ICT1233 (4-digit) and SEUSL sheet codes such as CMS12012 (5-digit), spaces stripped in normalize.
const SUBJECT_PATTERN = /\b[A-Z]{3}\d{4,5}[A-Z]?\b/i;

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
  if (raw === 'AB' || raw === 'ABSENT') {
    return ABSENT_RESULT_CODE;
  }
  const compact = raw.replace('−', '-').replace(/\s+/g, '');
  if (compact === 'E(CA)' || compact === 'ECA' || compact === 'E(CA.)') {
    return ECA_RESULT_CODE;
  }
  if (compact.replace(/[()]/g, '') === 'ECA') {
    return ECA_RESULT_CODE;
  }
  if (compact === 'E(ESA)' || compact === 'EESA' || compact.replace(/[()]/g, '') === 'EESA') {
    return ESA_INCOMPLETE_RESULT_CODE;
  }
  if (
    compact === 'E(CA&ESA)' ||
    compact.replace(/[()]/g, '') === 'ECA&ESA'
  ) {
    return CA_AND_ESA_INCOMPLETE_RESULT_CODE;
  }
  return compact;
}

export function isKnownGrade(resultCode) {
  return Object.prototype.hasOwnProperty.call(DICT_GRADE_POINTS, resultCode);
}

export function isRecognizedNonGrade(resultCode) {
  return Object.prototype.hasOwnProperty.call(RECOGNIZED_NON_GRADE_RESULTS, resultCode);
}

export function countsAsIncompleteCa(resultCode) {
  return resultCode === ECA_RESULT_CODE || resultCode === CA_AND_ESA_INCOMPLETE_RESULT_CODE;
}

export function looksLikeRegistrationNumber(value) {
  return REG_PATTERN.test(normalizeRegistrationNumber(value));
}

export function looksLikeSubjectCode(value) {
  return SUBJECT_PATTERN.test(normalizeSubjectCode(value));
}
