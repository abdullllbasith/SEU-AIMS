/**
 * Pure component rules. No I/O.
 * Component pass marks are percentages of each component's own maximum (open question A2).
 * A component that does not apply (for example ESA in a 100/0 scheme) is never required,
 * never accepted and never pass-checked.
 */

export const COMPONENT_KEYS = Object.freeze({ CA: 'CA', ESA: 'ESA' });

function isMark(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

/**
 * Check entered component marks (each 0..100 percent of that component) against a scheme
 * from getAssessmentScheme. Returns problems, empty when valid.
 */
export function validateComponentMarks(scheme, marks = {}) {
  if (!scheme || scheme.status !== 'VERIFIED') {
    return ['SCHEME_NOT_VERIFIED'];
  }
  const problems = [];
  for (const component of scheme.components) {
    const value = marks[component.key];
    if (!component.applicable) {
      if (value !== undefined && value !== null) {
        problems.push(`${component.key}_NOT_APPLICABLE`);
      }
    } else if (value !== undefined && value !== null && !isMark(value)) {
      problems.push(`${component.key}_OUT_OF_RANGE`);
    }
  }
  return problems;
}

/**
 * Component pass checks. `passed` is null when the mark is missing or the component does not apply.
 */
export function checkComponentPasses(scheme, marks = {}) {
  const result = {};
  for (const component of scheme?.components || []) {
    const value = marks[component.key];
    result[component.key] = {
      applicable: component.applicable,
      passed: component.applicable && isMark(value) ? value >= component.passMark : null,
    };
  }
  return result;
}
