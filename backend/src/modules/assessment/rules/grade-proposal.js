/**
 * Grade proposal from component results. Pure, no I/O.
 *
 * Handbook Table 5.5.1 percentages are "for reference" and grades are given "on a relative basis"
 * (5.5), so the band table is only a proposal. The Board may authorize a different code.
 * Table 5.3 gives E(CA), E(ESA) and E(CA&ESA) for a failed component.
 */

export const REFERENCE_TABLE = Object.freeze([
  { min: 85, grade: 'A+' },
  { min: 75, grade: 'A' },
  { min: 70, grade: 'A-' },
  { min: 65, grade: 'B+' },
  { min: 60, grade: 'B' },
  { min: 55, grade: 'B-' },
  { min: 50, grade: 'C+' },
  { min: 45, grade: 'C' },
  { min: 40, grade: 'C-' },
  { min: 35, grade: 'D' },
  { min: 0, grade: 'E' },
]);

export function gradeForFinalMark(finalMark) {
  if (typeof finalMark !== 'number' || !Number.isFinite(finalMark) || finalMark < 0 || finalMark > 100) {
    return null;
  }
  return REFERENCE_TABLE.find((band) => finalMark >= band.min).grade;
}

/**
 * @param {{ caPassed: boolean|null, esaPassed: boolean|null, finalMark: number|null }} input
 *   esaPassed is null when the scheme has no ESA. caPassed and, for schemes with ESA, esaPassed must be known.
 * @returns {string|null} proposed code, or null while a needed input is missing
 */
export function proposeResultCode({ caPassed, esaPassed, esaApplicable = true, finalMark }) {
  if (caPassed === null || caPassed === undefined) {
    return null;
  }
  if (!esaApplicable) {
    return caPassed ? gradeForFinalMark(finalMark) : 'E(CA)';
  }
  if (esaPassed === null || esaPassed === undefined) {
    return null;
  }
  if (!caPassed && !esaPassed) {
    return 'E(CA&ESA)';
  }
  if (!caPassed) {
    return 'E(CA)';
  }
  if (!esaPassed) {
    return 'E(ESA)';
  }
  return gradeForFinalMark(finalMark);
}
