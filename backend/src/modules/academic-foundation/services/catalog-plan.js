import { CATALOG_STREAM_SPECIALIZATION } from '../constants.js';

function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function nameKey(name) {
  return normalizeName(name).toLowerCase();
}

function placementKey(year, semester, specialization) {
  return `${year}|${semester}|${specialization || 'COMMON'}`;
}

function specializationFor(course) {
  if (!Object.prototype.hasOwnProperty.call(CATALOG_STREAM_SPECIALIZATION, course.stream)) {
    return { error: 'UNKNOWN_STREAM' };
  }
  const specialization = CATALOG_STREAM_SPECIALIZATION[course.stream];
  const commonYear = course.year === 1 || course.year === 2;
  const specializedYear = course.year === 3 || course.year === 4;
  if (specialization === null && commonYear) {
    return { specialization: null };
  }
  if (specialization && specializedYear) {
    return { specialization };
  }
  return { error: 'AMBIGUOUS_SPECIALIZATION' };
}

/**
 * Collapse the vendored calculator curriculum into subjects and specialized mappings.
 * Elective selection rules stay in the report because CurriculumMapping has no elective fields.
 */
export function buildCatalogPlan(catalog) {
  const courses = Array.isArray(catalog?.courses) ? catalog.courses : [];
  const byCode = new Map();
  const electiveRules = new Map();

  for (const course of courses) {
    const code = String(course.code || '').trim().toUpperCase();
    const name = normalizeName(course.name);
    const credits = Number(course.credits);
    const countsForGpa = Boolean(course.countsForGpa);
    const year = Number(course.year);
    const semester = Number(course.semester);
    if (!code || !name || !Number.isInteger(credits) || credits < 0 || !Number.isInteger(year) || !Number.isInteger(semester)) {
      continue;
    }
    if (!byCode.has(code)) {
      byCode.set(code, []);
    }
    byCode.get(code).push({
      code,
      name,
      credits,
      countsForGpa,
      year,
      semester,
      stream: course.stream || '',
      role: course.role || 'CORE',
      electiveGroupId: course.electiveGroupId || null,
      pairsWith: course.pairsWith || null,
      electiveLabel: course.electiveLabel || null,
      select: course.select ?? null,
      pairedPracticalRequired: Boolean(course.pairedPracticalRequired),
    });
    if (course.electiveGroupId) {
      const ruleKey = `${course.stream}|${year}|${semester}|${course.electiveGroupId}`;
      if (!electiveRules.has(ruleKey)) {
        electiveRules.set(ruleKey, {
          stream: course.stream || '',
          year,
          semester,
          electiveGroupId: course.electiveGroupId,
          electiveLabel: course.electiveLabel || '',
          select: course.select ?? null,
          pairedPracticalRequired: Boolean(course.pairedPracticalRequired),
        });
      }
    }
  }

  const conflicts = [];
  const subjects = [];
  const mappings = [];

  for (const [code, occurrences] of byCode) {
    const names = [...new Set(occurrences.map((item) => nameKey(item.name)))];
    const credits = [...new Set(occurrences.map((item) => item.credits))];
    const gpaFlags = [...new Set(occurrences.map((item) => item.countsForGpa))];
    const reasons = [];
    if (names.length > 1) {
      reasons.push('NAME_MISMATCH');
    }
    if (credits.length > 1) {
      reasons.push('CREDIT_MISMATCH');
    }
    if (gpaFlags.length > 1) {
      reasons.push('GPA_FLAG_MISMATCH');
    }
    if (reasons.length) {
      conflicts.push({
        code,
        reasons,
        names: [...new Set(occurrences.map((item) => item.name))],
        credits,
        countsForGpa: gpaFlags,
        placements: occurrences.map((item) => ({
          year: item.year,
          semester: item.semester,
          stream: item.stream,
          role: item.role,
        })),
      });
      continue;
    }
    const subject = {
      code,
      name: occurrences[0].name,
      credits: credits[0],
      countsForGpa: gpaFlags[0],
    };
    subjects.push(subject);
    const periods = new Map();
    const placementConflicts = [];
    for (const item of occurrences) {
      const resolved = specializationFor(item);
      if (resolved.error) {
        placementConflicts.push({
          year: item.year,
          semester: item.semester,
          stream: item.stream,
          reason: resolved.error,
        });
        continue;
      }
      const key = placementKey(item.year, item.semester, resolved.specialization);
      if (!periods.has(key)) {
        periods.set(key, {
          code,
          year: item.year,
          semester: item.semester,
          specialization: resolved.specialization,
          streams: [],
          roles: [],
        });
      }
      const period = periods.get(key);
      if (item.stream && !period.streams.includes(item.stream)) {
        period.streams.push(item.stream);
      }
      if (item.role && !period.roles.includes(item.role)) {
        period.roles.push(item.role);
      }
    }
    if (placementConflicts.length) {
      conflicts.push({
        code,
        reasons: [...new Set(placementConflicts.map((item) => item.reason))],
        names: [subject.name],
        credits: [subject.credits],
        countsForGpa: [subject.countsForGpa],
        placements: placementConflicts,
      });
    }
    mappings.push(...periods.values());
  }

  subjects.sort((left, right) => left.code.localeCompare(right.code));
  mappings.sort((left, right) => left.year - right.year || left.semester - right.semester || left.code.localeCompare(right.code) || String(left.specialization || '').localeCompare(String(right.specialization || '')));
  conflicts.sort((left, right) => left.code.localeCompare(right.code));

  return {
    source: catalog?.source || {},
    courseRows: courses.length,
    subjects,
    mappings,
    conflicts,
    unstored: {
      specializations: ['Software Technologies', 'Network & Security Technologies'],
      electiveRules: [...electiveRules.values()].sort(
        (left, right) => left.year - right.year || left.semester - right.semester || left.electiveGroupId.localeCompare(right.electiveGroupId),
      ),
      note: 'Elective selection rules are reported and are not stored. Years 1 and 2 use no specialization. Years 3 and 4 use SWT or NST. A subject shared by both specializations remains one subject with one mapping for each specialization.',
    },
  };
}
