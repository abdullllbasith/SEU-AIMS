export const RESULT_IMPORT_STATUSES = Object.freeze([
  'UPLOADED',
  'PROCESSING',
  'PARSED',
  'VALIDATION_ISSUES',
  'READY_FOR_REVIEW',
  'CONFIRMED',
  'COMMITTED',
  'FAILED',
  'REJECTED_FILE',
  'PARSE_FAILED',
]);

export const ROW_STATUSES = Object.freeze(['VALID', 'WARNING', 'BLOCKED']);

export const MATCH_STATUSES = Object.freeze(['UNMATCHED', 'MATCHED', 'AMBIGUOUS']);

export const ECA_RESULT_CODE = 'E(CA)';

/**
 * Grade points copied from the approved DICT-SEUSL GPA calculator reference:
 * https://github.com/abdullllbasith/DICT-SEUSL-GPA-Calculator (app.js GRADE_POINTS).
 * Do not add unlisted markers here.
 */
export const DICT_GRADE_POINTS = Object.freeze({
  'A+': 4.0,
  A: 4.0,
  'A-': 3.7,
  'B+': 3.3,
  B: 3.0,
  'B-': 2.7,
  'C+': 2.3,
  C: 2.0,
  'C-': 1.7,
  D: 1.3,
  E: 0.0,
});
