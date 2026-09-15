/**
 * Authoritative GPA/CGPA engine.
 * Grade points, semester formula, CGPA aggregation, rounding, and class bands
 * follow DICT-SEUSL-GPA-Calculator app.js (inspected 2026-09-15).
 * https://github.com/abdullllbasith/DICT-SEUSL-GPA-Calculator
 *
 * Official academic results in this system keep one current value per
 * registrationNumber+subjectCode, so CGPA uses that current official grade
 * (repeat imports update the same record). E(CA) and other markers absent
 * from GRADE_POINTS are excluded from the weighted average rather than mapped to E.
 */
import { DICT_GRADE_POINTS } from '../../results/constants.js';

export function round2(value) {
  return Math.round(value * 100) / 100;
}

export function classifyDegreeByGpa(cgpa) {
  if (cgpa >= 3.7) {
    return 'First Class';
  }
  if (cgpa >= 3.3) {
    return 'Second Class (Upper Division)';
  }
  if (cgpa >= 3.0) {
    return 'Second Class (Lower Division)';
  }
  if (cgpa >= 2.0) {
    return 'Pass';
  }
  return 'Degree Incomplete';
}

export function gradePointFor(resultCode) {
  if (!Object.prototype.hasOwnProperty.call(DICT_GRADE_POINTS, resultCode)) {
    return null;
  }
  return DICT_GRADE_POINTS[resultCode];
}

export function calculateWeightedGpa(courses) {
  let credits = 0;
  let qualityPoints = 0;
  const included = [];
  const excluded = [];
  for (const course of courses) {
    if (course.countsForGpa === false) {
      excluded.push({ ...course, reason: 'NGPA' });
      continue;
    }
    const gp = gradePointFor(course.resultCode);
    if (gp == null || !course.credits) {
      excluded.push({ ...course, reason: gp == null ? 'NOT_IN_GRADE_MAP' : 'NO_CREDITS' });
      continue;
    }
    credits += course.credits;
    qualityPoints += course.credits * gp;
    included.push({ ...course, gradePoint: gp });
  }
  const gpa = credits > 0 ? round2(qualityPoints / credits) : 0;
  return { credits, qualityPoints: round2(qualityPoints), gpa, included, excluded };
}
