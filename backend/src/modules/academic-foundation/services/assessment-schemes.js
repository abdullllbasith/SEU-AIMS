import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CA/ESA weights per course code, taken from the BICT handbook tables 3.9.3 to 3.9.8.
 * Stored per code and never inferred from course category.
 *
 * Handbook: weights vary per course and "must be approved by the university" (section 5, 5.6 iv).
 * The pass rule (CA >= 40%, ESA >= 35%) is stored here as data and is not evaluated yet.
 * Open question A2: the 40 and 35 are assumed to be percentages of each component's own maximum.
 */

const DATA_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/assessment-schemes.json');

export const SCHEME_STATUSES = Object.freeze({ VERIFIED: 'VERIFIED', UNVERIFIED: 'UNVERIFIED' });

/** Handbook 5.6 iv. A failed component is repeated. */
export const COMPONENT_PASS_MARKS = Object.freeze({ ca: 40, esa: 35 });

let cache = null;

function load() {
  if (!cache) {
    const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
    cache = new Map(Object.entries(raw.schemes));
  }
  return cache;
}

export function listSchemeCodes() {
  return [...load().keys()];
}

/**
 * Scheme for a course code, or null when the handbook has no row for it.
 * An UNVERIFIED scheme (blank handbook cell) has null weights and must block marks entry.
 */
export function getAssessmentScheme(subjectCode) {
  const entry = load().get(String(subjectCode || '').trim().toUpperCase());
  if (!entry) {
    return null;
  }
  const components = [];
  if (entry.status === SCHEME_STATUSES.VERIFIED) {
    components.push({ key: 'CA', weight: entry.ca, passMark: COMPONENT_PASS_MARKS.ca, applicable: true });
    components.push(
      entry.esa === null
        ? { key: 'ESA', weight: null, passMark: null, applicable: false }
        : { key: 'ESA', weight: entry.esa, passMark: COMPONENT_PASS_MARKS.esa, applicable: true },
    );
  }
  return { subjectCode: String(subjectCode).trim().toUpperCase(), status: entry.status, components };
}

/**
 * Check a set of assessment components. Applicable weights must sum to 100, and a component
 * that does not apply carries no weight and no pass mark.
 * @returns {string[]} problems, empty when valid
 */
export function validateAssessmentComponents(components) {
  const problems = [];
  if (!Array.isArray(components) || components.length === 0) {
    return ['At least one component is required'];
  }
  const keys = new Set();
  let total = 0;
  for (const component of components) {
    if (keys.has(component.key)) {
      problems.push(`Duplicate component ${component.key}`);
    }
    keys.add(component.key);
    if (component.applicable) {
      if (!Number.isFinite(component.weight) || component.weight <= 0 || component.weight > 100) {
        problems.push(`${component.key} weight must be above 0 and at most 100`);
      } else {
        total += component.weight;
      }
      if (component.passMark !== null && component.passMark !== undefined) {
        if (!Number.isFinite(component.passMark) || component.passMark < 0 || component.passMark > 100) {
          problems.push(`${component.key} pass mark must be between 0 and 100`);
        }
      }
    } else if (component.weight || component.passMark) {
      problems.push(`${component.key} does not apply, so it must have no weight and no pass mark`);
    }
  }
  if (total !== 100) {
    problems.push(`Applicable weights must sum to 100, got ${total}`);
  }
  return problems;
}
