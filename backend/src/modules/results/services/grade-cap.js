import { loadConfig } from '../../../config/index.js';
import { DICT_GRADE_POINTS } from '../constants.js';
import { isKnownGrade } from './normalize.js';
import { C_PASS_POLICY_LABEL, C_PASS_RESULT_CODE, resolveRepeatOfficialGrade } from './repeat-grade.js';

/**
 * Unified repeat-grade cap.
 *
 * Handbook (section 5.6 ii, iii): a repeat grade for E, D or C- may be upgraded to a maximum of C.
 * The handbook does not say whether E(CA), E(ESA) or E(CA&ESA) count as "E" for that cap.
 * Those stay on their current handling until the department answers (open policy question A1).
 *
 * Modes (GRADE_CAP_MODE):
 *   LEGACY   returns exactly what resolveRepeatOfficialGrade returns today.
 *   SHADOW   returns the legacy decision and records what the unified policy would have done.
 *   ENFORCED returns the unified decision. Needs written department confirmation first.
 */

export const GRADE_CAP_MODES = Object.freeze({ LEGACY: 'LEGACY', SHADOW: 'SHADOW', ENFORCED: 'ENFORCED' });

export const CAP_TREATMENTS = Object.freeze({
  /** Confirmed by the handbook. Capped at C when the repeat grade is above C. */
  AUTO_CAP: 'AUTO_CAP',
  /** Not confirmed by the handbook. Today's handling is kept exactly. */
  LEGACY_PRESERVED_UNCONFIRMED: 'LEGACY_PRESERVED_UNCONFIRMED',
  NO_CAP: 'NO_CAP',
});

/**
 * Treatment by current official code. Anything not listed is NO_CAP.
 * This table is the only place the cap rule is written down.
 */
export const GRADE_CAP_POLICY = Object.freeze({
  version: 'GRADE-CAP-1',
  treatments: Object.freeze({
    E: CAP_TREATMENTS.AUTO_CAP,
    D: CAP_TREATMENTS.AUTO_CAP,
    'C-': CAP_TREATMENTS.AUTO_CAP,
    'E(ESA)': CAP_TREATMENTS.LEGACY_PRESERVED_UNCONFIRMED,
    'E(CA&ESA)': CAP_TREATMENTS.LEGACY_PRESERVED_UNCONFIRMED,
    'E(CA)': CAP_TREATMENTS.LEGACY_PRESERVED_UNCONFIRMED,
  }),
});

export function treatmentFor(currentResultCode, policy = GRADE_CAP_POLICY) {
  return policy.treatments[currentResultCode] || CAP_TREATMENTS.NO_CAP;
}

let cachedMode = null;

/** Reads the flag once per process. loadConfig re-reads .env files, so it is not called per row. */
export function resolveGradeCapMode(config) {
  if (config === undefined && cachedMode) {
    return cachedMode;
  }
  const mode = (config === undefined ? loadConfig() : config)?.features?.gradeCapMode;
  const resolved = Object.prototype.hasOwnProperty.call(GRADE_CAP_MODES, mode) ? mode : GRADE_CAP_MODES.LEGACY;
  if (config === undefined) {
    cachedMode = resolved;
  }
  return resolved;
}

/**
 * Unified decision, independent of the mode. Same result shape as resolveRepeatOfficialGrade
 * plus `treatment` and `policyVersion`.
 */
export function evaluateRepeatCap(currentResultCode, incomingResultCode, policy = GRADE_CAP_POLICY) {
  const treatment = treatmentFor(currentResultCode, policy);
  const legacy = resolveRepeatOfficialGrade(currentResultCode, incomingResultCode);

  if (treatment === CAP_TREATMENTS.AUTO_CAP && isKnownGrade(incomingResultCode)) {
    const incomingPoint = DICT_GRADE_POINTS[incomingResultCode];
    const capPoint = DICT_GRADE_POINTS[C_PASS_RESULT_CODE];
    if (incomingPoint > capPoint) {
      return {
        officialResultCode: C_PASS_RESULT_CODE,
        rawResultCode: incomingResultCode,
        gradeCapApplied: true,
        gradeCapReason: currentResultCode,
        reviewRequired: false,
        blockedReason: '',
        explanation: `Repeat grade ${incomingResultCode} is capped at ${C_PASS_POLICY_LABEL} (${C_PASS_RESULT_CODE}, grade point ${capPoint}) because the current result is ${currentResultCode}.`,
        treatment,
        policyVersion: policy.version,
      };
    }
  }

  return { ...legacy, treatment, policyVersion: policy.version };
}

const COMPARED_FIELDS = ['officialResultCode', 'gradeCapApplied', 'gradeCapReason', 'reviewRequired', 'blockedReason'];

export function diffCapDecisions(legacy, unified) {
  const changed = COMPARED_FIELDS.filter((field) => legacy[field] !== unified[field]);
  return changed.length
    ? {
        fields: changed,
        legacyOfficialResultCode: legacy.officialResultCode,
        unifiedOfficialResultCode: unified.officialResultCode,
        treatment: unified.treatment,
        policyVersion: unified.policyVersion,
      }
    : null;
}

/**
 * Entry point for import and repeat paths. In LEGACY mode the output is exactly the legacy
 * decision object. In SHADOW mode the legacy decision carries `capShadowDiff` when the unified
 * policy would have decided differently. The official grade is never changed in SHADOW.
 */
export function resolveRepeatGrade(currentResultCode, incomingResultCode, { mode = resolveGradeCapMode() } = {}) {
  const legacy = resolveRepeatOfficialGrade(currentResultCode, incomingResultCode);
  if (mode === GRADE_CAP_MODES.LEGACY) {
    return legacy;
  }
  const unified = evaluateRepeatCap(currentResultCode, incomingResultCode);
  if (mode === GRADE_CAP_MODES.ENFORCED) {
    return unified;
  }
  const capShadowDiff = diffCapDecisions(legacy, unified);
  return capShadowDiff ? { ...legacy, capShadowDiff } : legacy;
}
