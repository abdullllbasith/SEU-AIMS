/**
 * Shared academic display labels derived from foundation records.
 * Prefer year/semester/subject fields already returned by the API — do not invent structure.
 */

function text(value) {
  return String(value ?? '').trim();
}

export function indexById(items = []) {
  return new Map(items.filter(Boolean).map((item) => [String(item.id), item]));
}

export function formatDepartmentName(department) {
  if (!department) {
    return '';
  }
  return text(department.name) || text(department.code);
}

export function formatDepartmentLead(department) {
  const name = formatDepartmentName(department);
  return name || 'Department structure derived from academic foundation records.';
}

/** Strip seed-style " Y2" suffixes when year context is known from the linked year record. */
function cleanSemesterName(semesterName, year) {
  let cleaned = text(semesterName);
  if (!cleaned) {
    return cleaned;
  }
  const sequence = Number(year?.sequence);
  if (Number.isFinite(sequence)) {
    const suffix = new RegExp(`\\s*Y${sequence}\\s*$`, 'i');
    const stripped = cleaned.replace(suffix, '').trim();
    if (stripped) {
      cleaned = stripped;
    }
  } else if (text(year?.name)) {
    const loose = cleaned.replace(/\s*Y\d+\s*$/i, '').trim();
    if (loose) {
      cleaned = loose;
    }
  }
  const yearName = text(year?.name);
  if (yearName && cleaned.toLowerCase().startsWith(`${yearName.toLowerCase()} · `)) {
    cleaned = cleaned.slice(yearName.length + 3).trim();
  }
  return cleaned;
}

export function formatYearLabel(year) {
  return text(year?.name) || (year?.sequence != null ? `Year ${year.sequence}` : '');
}

/** Clean semester display name without year prefix (for tables that already show the year). */
export function formatSemesterShortName(semester, year) {
  let semesterName = cleanSemesterName(semester?.name, year);
  if (!semesterName && semester?.sequence != null) {
    semesterName = `Semester ${semester.sequence}`;
  }
  return semesterName;
}

export function formatSemesterLabel(semester, year) {
  if (!semester && !year) {
    return '';
  }
  const yearName = formatYearLabel(year);
  const semesterName = formatSemesterShortName(semester, year);
  if (yearName && semesterName) {
    if (semesterName.toLowerCase() === yearName.toLowerCase()) {
      return yearName;
    }
    if (semesterName.toLowerCase().includes(yearName.toLowerCase())) {
      return semesterName;
    }
    return `${yearName} · ${semesterName}`;
  }
  return semesterName || yearName;
}

export function formatBatchLabel(batch) {
  const code = text(batch?.code);
  const name = text(batch?.name);
  if (code && name && code.toLowerCase() !== name.toLowerCase()) {
    return `${code} — ${name}`;
  }
  return name || code;
}

export function formatSubjectLabel({ code, name, subjectCode, subjectName } = {}) {
  const resolvedCode = text(code || subjectCode);
  const resolvedName = text(name || subjectName);
  if (resolvedCode && resolvedName) {
    return `${resolvedCode} — ${resolvedName}`;
  }
  return resolvedCode || resolvedName;
}

/** Prefer the code and name returned on the row. Fall back to the loaded subject list. */
export function formatLinkedSubjectLabel(row, lookups = {}) {
  const subject = lookups.subjects?.get?.(String(row?.subjectId));
  return formatSubjectLabel({
    code: row?.subjectCode || subject?.code,
    name: row?.subjectName || subject?.name,
  });
}

export function formatOfferingLabel(offering, lookups = {}) {
  if (!offering) {
    return '';
  }
  const subject = lookups.subjects?.get?.(String(offering.subjectId)) || {
    code: offering.subjectCode,
    name: offering.subjectName,
  };
  const batch =
    lookups.batches?.get?.(String(offering.batchId)) ||
    ({
      code: offering.batchCode,
      name: offering.batchName,
    });
  const year =
    lookups.years?.get?.(String(offering.academicYearId)) ||
    ({
      name: offering.academicYearName,
      sequence: offering.academicYearSequence,
    });
  const semester =
    lookups.semesters?.get?.(String(offering.semesterId)) ||
    ({
      name: offering.semesterName,
      sequence: offering.semesterSequence,
    });
  const subjectLabel = formatSubjectLabel({
    code: offering.subjectCode || subject?.code,
    name: offering.subjectName || subject?.name,
  });
  const period = [formatBatchLabel(batch), formatSemesterLabel(semester, year)].filter(Boolean).join(' · ');
  if (subjectLabel && period) {
    return `${subjectLabel} (${period})`;
  }
  return subjectLabel || period || text(offering.id);
}

export function formatActiveYearsLabel(years = []) {
  const sorted = [...years].sort((left, right) => Number(left.sequence || 0) - Number(right.sequence || 0));
  const labels = [];
  const seen = new Set();
  for (const year of sorted) {
    const label = formatYearLabel(year);
    if (!label || seen.has(label)) {
      continue;
    }
    seen.add(label);
    labels.push(label);
  }
  return labels.length ? labels.join(', ') : 'None marked active';
}

export function formatActiveSemestersLabel(semesters = [], years = []) {
  const yearById = indexById(years);
  const sorted = [...semesters].sort((left, right) => {
    const leftYear = yearById.get(String(left.academicYearId));
    const rightYear = yearById.get(String(right.academicYearId));
    const yearDelta = Number(leftYear?.sequence || 0) - Number(rightYear?.sequence || 0);
    if (yearDelta !== 0) {
      return yearDelta;
    }
    return Number(left.sequence || 0) - Number(right.sequence || 0);
  });
  const labels = [];
  const seen = new Set();
  for (const semester of sorted) {
    const label = formatSemesterLabel(semester, yearById.get(String(semester.academicYearId)));
    if (!label || seen.has(label)) {
      continue;
    }
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

export function displayOrDash(value) {
  const label = text(value);
  return label || '—';
}
