/**
 * Weighted final mark. Separate from pass checks: a student can reach a passing weighted mark
 * and still fail a component. Needs every applicable component mark, otherwise returns null.
 */
export function computeFinalMark(scheme, marks = {}) {
  if (!scheme || scheme.status !== 'VERIFIED') {
    return null;
  }
  let total = 0;
  for (const component of scheme.components) {
    if (!component.applicable) {
      continue;
    }
    const value = marks[component.key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }
    total += (value * component.weight) / 100;
  }
  return Math.round(total * 100) / 100;
}
