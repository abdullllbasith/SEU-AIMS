import { DICT_SEUSL_CATALOG } from '../data/dict-seusl-catalog.js';
import { buildCatalogPlan } from './catalog-plan.js';
import { ACADEMIC_YEAR_SEQUENCE, SEMESTER_SEQUENCE } from '../constants.js';
import { Department } from '../models/department.model.js';
import { AcademicYear } from '../models/academic-year.model.js';
import { Semester } from '../models/semester.model.js';
import { Subject } from '../models/subject.model.js';
import { CurriculumMapping } from '../models/curriculum-mapping.model.js';
import { SubjectOffering } from '../models/subject-offering.model.js';
import { assertDepartmentAdmin } from '../policies/academic.policies.js';
import { recordAudit as persistAudit } from '../../audit-security/services/record-audit.service.js';
import { ValidationError } from '../../../shared/errors/app-error.js';

function nameKey(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

async function requireDepartment(principal) {
  assertDepartmentAdmin(principal);
  if (!principal.departmentId) {
    throw new ValidationError('Department is not configured for this administrator');
  }
  const department = await Department.findById(principal.departmentId);
  if (!department || department.status !== 'ACTIVE') {
    throw new ValidationError('Department is not active');
  }
  return department;
}

function emptySummary() {
  return {
    subjectsCreated: 0,
    subjectsUnchanged: 0,
    mappingsCreated: 0,
    mappingsUnchanged: 0,
    yearsCreated: 0,
    semestersCreated: 0,
    offeringsCreated: 0,
  };
}

async function loadDepartmentState(departmentId) {
  const [years, semesters, subjects, mappings, offeringCount] = await Promise.all([
    AcademicYear.find({ departmentId }),
    Semester.find({ departmentId }),
    Subject.find({ departmentId }),
    CurriculumMapping.find({ departmentId }),
    SubjectOffering.countDocuments({ departmentId }),
  ]);
  return { years, semesters, subjects, mappings, offeringCount };
}

function assess(plan, state) {
  const yearBySequence = new Map(state.years.map((year) => [year.sequence, year]));
  const semesterByYearSequence = new Map(
    state.semesters.map((semester) => [`${semester.academicYearId}|${semester.sequence}`, semester]),
  );
  const subjectByCode = new Map(state.subjects.map((subject) => [subject.code, subject]));

  const periods = [];
  for (const sequence of ACADEMIC_YEAR_SEQUENCE) {
    const year = yearBySequence.get(sequence);
    if (!year) {
      periods.push({ kind: 'year', sequence, action: 'CREATE', name: `Year ${sequence}` });
    } else if (year.status !== 'ACTIVE') {
      periods.push({ kind: 'year', sequence, action: 'BLOCKED', reason: 'PERIOD_ARCHIVED', id: String(year._id) });
    } else {
      periods.push({ kind: 'year', sequence, action: 'UNCHANGED', id: String(year._id), name: year.name });
    }
    for (const semesterSequence of SEMESTER_SEQUENCE) {
      const semester = year ? semesterByYearSequence.get(`${year._id}|${semesterSequence}`) : null;
      if (year && year.status !== 'ACTIVE') {
        periods.push({
          kind: 'semester',
          yearSequence: sequence,
          sequence: semesterSequence,
          action: 'BLOCKED',
          reason: 'PERIOD_ARCHIVED',
        });
      } else if (!semester) {
        periods.push({
          kind: 'semester',
          yearSequence: sequence,
          sequence: semesterSequence,
          action: 'CREATE',
          name: `Semester ${semesterSequence}`,
        });
      } else if (semester.status !== 'ACTIVE') {
        periods.push({
          kind: 'semester',
          yearSequence: sequence,
          sequence: semesterSequence,
          action: 'BLOCKED',
          reason: 'PERIOD_ARCHIVED',
          id: String(semester._id),
        });
      } else {
        periods.push({
          kind: 'semester',
          yearSequence: sequence,
          sequence: semesterSequence,
          action: 'UNCHANGED',
          id: String(semester._id),
          name: semester.name,
        });
      }
    }
  }

  const subjectRows = plan.subjects.map((subject) => {
    const existing = subjectByCode.get(subject.code);
    if (!existing) {
      return { ...subject, action: 'CREATE' };
    }
    const reasons = [];
    if (existing.credits !== subject.credits) {
      reasons.push('CREDIT_MISMATCH');
    }
    if (Boolean(existing.countsForGpa) !== subject.countsForGpa) {
      reasons.push('GPA_FLAG_MISMATCH');
    }
    if (nameKey(existing.name) !== nameKey(subject.name)) {
      reasons.push('NAME_MISMATCH');
    }
    if (reasons.length) {
      return {
        ...subject,
        action: 'CONFLICT',
        reasons,
        existing: { name: existing.name, credits: existing.credits, countsForGpa: existing.countsForGpa },
      };
    }
    if (existing.status !== 'ACTIVE') {
      return { ...subject, action: 'BLOCKED', reason: 'SUBJECT_ARCHIVED', subjectId: String(existing._id) };
    }
    return { ...subject, action: 'UNCHANGED', subjectId: String(existing._id) };
  });

  const conflictCodes = new Set([
    ...plan.conflicts.map((item) => item.code),
    ...subjectRows.filter((item) => item.action === 'CONFLICT' || item.action === 'BLOCKED').map((item) => item.code),
  ]);

  const mappingRows = plan.mappings.map((mapping) => {
    if (conflictCodes.has(mapping.code)) {
      return { ...mapping, action: 'BLOCKED', reason: 'SUBJECT_CONFLICT' };
    }
    const year = yearBySequence.get(mapping.year);
    const semester = year ? semesterByYearSequence.get(`${year._id}|${mapping.semester}`) : null;
    if (!year || year.status !== 'ACTIVE' || !semester || semester.status !== 'ACTIVE') {
      return { ...mapping, action: 'CREATE' };
    }
    const subject = subjectByCode.get(mapping.code);
    if (!subject || subject.status !== 'ACTIVE') {
      return { ...mapping, action: 'CREATE' };
    }
    const wanted = mapping.specialization || null;
    const periodMappings = state.mappings.filter(
      (item) =>
        String(item.subjectId) === String(subject._id) &&
        String(item.academicYearId) === String(year._id) &&
        String(item.semesterId) === String(semester._id),
    );
    const exact = periodMappings.find((item) => (item.specialization || null) === wanted);
    if (exact) {
      return { ...mapping, action: 'UNCHANGED', mappingId: String(exact._id) };
    }
    if (wanted && periodMappings.some((item) => !(item.specialization || null))) {
      return { ...mapping, action: 'BLOCKED', reason: 'EXISTING_UNSPECIALIZED_MAPPING' };
    }
    if (!wanted && periodMappings.some((item) => item.specialization)) {
      return { ...mapping, action: 'BLOCKED', reason: 'EXISTING_SPECIALIZED_MAPPING' };
    }
    return { ...mapping, action: 'CREATE' };
  });

  for (const mapping of mappingRows) {
    if (mapping.action !== 'CREATE') {
      continue;
    }
    const yearPeriod = periods.find((item) => item.kind === 'year' && item.sequence === mapping.year);
    const semesterPeriod = periods.find(
      (item) => item.kind === 'semester' && item.yearSequence === mapping.year && item.sequence === mapping.semester,
    );
    if (yearPeriod?.action === 'BLOCKED' || semesterPeriod?.action === 'BLOCKED') {
      mapping.action = 'BLOCKED';
      mapping.reason = yearPeriod?.reason || semesterPeriod?.reason || 'PERIOD_ARCHIVED';
    }
  }

  return { periods, subjectRows, mappingRows };
}

function present(plan, assessment, summary, offeringCount) {
  return {
    source: plan.source,
    summary,
    offeringCount,
    offeringsCreated: 0,
    conflicts: plan.conflicts,
    databaseConflicts: assessment.subjectRows.filter((item) => item.action === 'CONFLICT'),
    blockedSubjects: assessment.subjectRows.filter((item) => item.action === 'BLOCKED'),
    ambiguousMappings: assessment.mappingRows.filter((item) =>
      ['EXISTING_UNSPECIALIZED_MAPPING', 'EXISTING_SPECIALIZED_MAPPING', 'AMBIGUOUS_SPECIALIZATION'].includes(item.reason),
    ),
    subjects: {
      create: assessment.subjectRows.filter((item) => item.action === 'CREATE').length,
      unchanged: assessment.subjectRows.filter((item) => item.action === 'UNCHANGED').length,
      conflict: assessment.subjectRows.filter((item) => item.action === 'CONFLICT').length,
      blocked: assessment.subjectRows.filter((item) => item.action === 'BLOCKED').length,
    },
    mappings: {
      create: assessment.mappingRows.filter((item) => item.action === 'CREATE').length,
      unchanged: assessment.mappingRows.filter((item) => item.action === 'UNCHANGED').length,
      blocked: assessment.mappingRows.filter((item) => item.action === 'BLOCKED').length,
    },
    periods: {
      create: assessment.periods.filter((item) => item.action === 'CREATE'),
      blocked: assessment.periods.filter((item) => item.action === 'BLOCKED'),
    },
    unstored: plan.unstored,
    catalogConflicts: plan.conflicts.length,
    canCommit: true,
  };
}

export async function previewCatalogImport(principal) {
  const department = await requireDepartment(principal);
  const plan = buildCatalogPlan(DICT_SEUSL_CATALOG);
  const state = await loadDepartmentState(department._id);
  const assessment = assess(plan, state);
  return {
    departmentId: String(department._id),
    ...present(plan, assessment, emptySummary(), state.offeringCount),
  };
}

export async function commitCatalogImport(principal) {
  const department = await requireDepartment(principal);
  const plan = buildCatalogPlan(DICT_SEUSL_CATALOG);
  const before = await loadDepartmentState(department._id);
  const summary = emptySummary();

  for (const sequence of ACADEMIC_YEAR_SEQUENCE) {
    const existing = await AcademicYear.findOne({ departmentId: department._id, sequence });
    if (existing) {
      continue;
    }
    await AcademicYear.create({
      departmentId: department._id,
      sequence,
      name: `Year ${sequence}`,
      status: 'ACTIVE',
    });
    summary.yearsCreated += 1;
  }

  const years = await AcademicYear.find({ departmentId: department._id, status: 'ACTIVE' });
  for (const year of years) {
    for (const sequence of SEMESTER_SEQUENCE) {
      const existing = await Semester.findOne({ academicYearId: year._id, sequence });
      if (existing) {
        continue;
      }
      await Semester.create({
        departmentId: department._id,
        academicYearId: year._id,
        sequence,
        name: `Semester ${sequence}`,
        status: 'ACTIVE',
      });
      summary.semestersCreated += 1;
    }
  }

  const state = await loadDepartmentState(department._id);
  const assessment = assess(plan, state);
  const yearBySequence = new Map(state.years.map((year) => [year.sequence, year]));
  const semesterByYearSequence = new Map(
    state.semesters.map((semester) => [`${semester.academicYearId}|${semester.sequence}`, semester]),
  );

  for (const subject of assessment.subjectRows) {
    if (subject.action !== 'CREATE') {
      if (subject.action === 'UNCHANGED') {
        summary.subjectsUnchanged += 1;
      }
      continue;
    }
    try {
      await Subject.create({
        departmentId: department._id,
        code: subject.code,
        name: subject.name,
        credits: subject.credits,
        countsForGpa: subject.countsForGpa,
        status: 'ACTIVE',
      });
      summary.subjectsCreated += 1;
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
      summary.subjectsUnchanged += 1;
    }
  }

  const subjects = await Subject.find({ departmentId: department._id });
  const subjectByCode = new Map(subjects.map((subject) => [subject.code, subject]));
  for (const mapping of assessment.mappingRows) {
    if (mapping.action === 'UNCHANGED') {
      summary.mappingsUnchanged += 1;
      continue;
    }
    if (mapping.action !== 'CREATE') {
      continue;
    }
    const subject = subjectByCode.get(mapping.code);
    const year = yearBySequence.get(mapping.year);
    const semester = year ? semesterByYearSequence.get(`${year._id}|${mapping.semester}`) : null;
    if (!subject || subject.status !== 'ACTIVE' || !year || year.status !== 'ACTIVE' || !semester || semester.status !== 'ACTIVE') {
      continue;
    }
    try {
      await CurriculumMapping.create({
        departmentId: department._id,
        subjectId: subject._id,
        academicYearId: year._id,
        semesterId: semester._id,
        specialization: mapping.specialization || null,
        status: 'ACTIVE',
      });
      summary.mappingsCreated += 1;
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
      summary.mappingsUnchanged += 1;
    }
  }

  const after = await loadDepartmentState(department._id);
  if (after.offeringCount !== before.offeringCount) {
    throw new ValidationError('Catalog import must not create subject offerings');
  }

  const finalAssessment = assess(plan, after);
  await persistAudit({
    actorUserId: principal.userId,
    action: 'academic.catalog.import',
    entityType: 'Department',
    entityId: department._id,
    metadata: summary,
  });
  return {
    departmentId: String(department._id),
    ...present(plan, finalAssessment, summary, after.offeringCount),
  };
}
