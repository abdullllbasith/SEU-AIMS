import { AcademicResult } from '../models/academic-result.model.js';
import { ResultRevision } from '../models/result-revision.model.js';

/**
 * The only module allowed to create or change an official grade on AcademicResult.
 * Every grade-changing path calls applyOfficialResultChange so authorization, Board
 * references, grade caps and audit can be enforced in one place later.
 *
 * Phase 1 (LEGACY): behaviour of the existing callers is preserved exactly. This writer
 * does the result write and the ResultRevision row, in the same order the callers did
 * before. Callers keep their own audit, incomplete-CA sync and GPA recalculation.
 * An architecture test (tests/unit/official-result-writer-boundary.test.js) fails if any
 * other file writes a grade.
 */

export const OFFICIAL_RESULT_CHANGE_KINDS = Object.freeze({
  IMPORT_COMMIT: 'IMPORT_COMMIT',
  IMPORT_SOURCED_REVIEW: 'IMPORT_SOURCED_REVIEW',
});

/** Fields a caller may set on the official row. Anything else is refused. */
const WRITABLE_FIELDS = Object.freeze([
  'resultCode',
  'rawResultCode',
  'previousResultCode',
  'gradeCapApplied',
  'gradeCapReason',
  'isEca',
  'sourceImportId',
]);

function assertKind(kind) {
  if (!Object.prototype.hasOwnProperty.call(OFFICIAL_RESULT_CHANGE_KINDS, kind)) {
    throw new TypeError(`Unknown official result change kind: ${kind}`);
  }
}

function pickWritable(fields = {}) {
  const unexpected = Object.keys(fields).filter((key) => !WRITABLE_FIELDS.includes(key));
  if (unexpected.length) {
    throw new TypeError(`Field not writable through the official result writer: ${unexpected.join(', ')}`);
  }
  return fields;
}

/**
 * @param {object} args
 * @param {string} args.kind One of OFFICIAL_RESULT_CHANGE_KINDS.
 * @param {{ userId: unknown }} args.principal Acting user.
 * @param {object|null} args.existing Current AcademicResult document, or null to create a row.
 * @param {object} args.identity Row identity, required when creating (department, student, subject, period).
 * @param {object} args.fields New official values (see WRITABLE_FIELDS).
 * @param {{ importId?: unknown, caRecoveryReviewId?: unknown }} args.link Source of the change for history.
 * @returns {Promise<object>} The saved AcademicResult document.
 */
export async function applyOfficialResultChange({ kind, principal, existing = null, identity = null, fields, link = {} }) {
  assertKind(kind);
  if (!principal?.userId) {
    throw new TypeError('An acting user is required for an official result change');
  }
  const values = pickWritable(fields);
  const previousResultCode = existing?.resultCode || '';
  let official = existing;

  if (!official) {
    if (!identity) {
      throw new TypeError('identity is required to create an official result');
    }
    official = await AcademicResult.create({
      ...identity,
      ...values,
      version: 1,
      committedByUserId: principal.userId,
    });
  } else {
    Object.assign(official, values);
    official.committedByUserId = principal.userId;
    official.version += 1;
    await official.save();
  }

  await ResultRevision.create({
    academicResultId: official._id,
    importId: link.importId,
    caRecoveryReviewId: link.caRecoveryReviewId,
    actorUserId: principal.userId,
    registrationNumber: official.registrationNumber,
    subjectCode: official.subjectCode,
    previousResultCode,
    newResultCode: official.resultCode,
    rawResultCode: official.rawResultCode,
    gradeCapApplied: Boolean(official.gradeCapApplied),
    gradeCapReason: official.gradeCapReason || '',
    changeKind: kind,
  });

  return official;
}
