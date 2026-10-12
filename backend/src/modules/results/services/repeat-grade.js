import {
  CA_AND_ESA_INCOMPLETE_RESULT_CODE,
  DICT_GRADE_POINTS,
  ECA_RESULT_CODE,
  ESA_INCOMPLETE_RESULT_CODE,
} from '../constants.js';
import { isKnownGrade, isRecognizedNonGrade } from './normalize.js';

/** Official DICT code for the confirmed C Pass cap. The calculator has no separate "C Pass" token. */
export const C_PASS_RESULT_CODE = 'C';
export const C_PASS_POLICY_LABEL = 'C Pass';

const REPEAT_CAP_SOURCES = new Set([ESA_INCOMPLETE_RESULT_CODE, CA_AND_ESA_INCOMPLETE_RESULT_CODE]);

export function gradePoint(resultCode) {
  return Object.prototype.hasOwnProperty.call(DICT_GRADE_POINTS, resultCode) ? DICT_GRADE_POINTS[resultCode] : null;
}

/**
 * Official grade for a repeat import.
 * Cap applies only when the current official result is E(ESA) or E(CA&ESA)
 * and the incoming value is a known grade above C Pass.
 */
export function resolveRepeatOfficialGrade(currentResultCode, incomingResultCode) {
  const rawResultCode = incomingResultCode;
  if (!currentResultCode) {
    return {
      officialResultCode: incomingResultCode,
      rawResultCode,
      gradeCapApplied: false,
      gradeCapReason: '',
      reviewRequired: false,
      blockedReason: '',
      explanation: '',
    };
  }

  if (currentResultCode === ECA_RESULT_CODE && isKnownGrade(incomingResultCode)) {
    return {
      officialResultCode: ECA_RESULT_CODE,
      rawResultCode,
      gradeCapApplied: false,
      gradeCapReason: '',
      reviewRequired: true,
      blockedReason: '',
      explanation: `CA recovery ${rawResultCode} stays pending review. The official result remains ${ECA_RESULT_CODE} until an authorized reviewer approves it.`,
    };
  }

  if (REPEAT_CAP_SOURCES.has(currentResultCode) && isRecognizedNonGrade(incomingResultCode) && incomingResultCode !== currentResultCode) {
    return {
      officialResultCode: currentResultCode,
      rawResultCode,
      gradeCapApplied: false,
      gradeCapReason: '',
      reviewRequired: false,
      blockedReason: 'AMBIGUOUS_REPEAT_RESULT',
      explanation: `${currentResultCode} cannot be replaced by ${incomingResultCode} without an explicit final grade.`,
    };
  }

  if (REPEAT_CAP_SOURCES.has(currentResultCode) && isKnownGrade(incomingResultCode)) {
    const incomingPoint = gradePoint(incomingResultCode);
    const capPoint = gradePoint(C_PASS_RESULT_CODE);
    if (incomingPoint != null && capPoint != null && incomingPoint > capPoint) {
      return {
        officialResultCode: C_PASS_RESULT_CODE,
        rawResultCode,
        gradeCapApplied: true,
        gradeCapReason: currentResultCode,
        reviewRequired: false,
        blockedReason: '',
        explanation: `Repeat grade ${rawResultCode} is capped at ${C_PASS_POLICY_LABEL} (${C_PASS_RESULT_CODE}, grade point ${capPoint}) because the current result is ${currentResultCode}.`,
      };
    }
    return {
      officialResultCode: incomingResultCode,
      rawResultCode,
      gradeCapApplied: false,
      gradeCapReason: '',
      reviewRequired: false,
      blockedReason: '',
      explanation: '',
    };
  }

  return {
    officialResultCode: incomingResultCode,
    rawResultCode,
    gradeCapApplied: false,
    gradeCapReason: '',
    reviewRequired: false,
    blockedReason: '',
    explanation: '',
  };
}
