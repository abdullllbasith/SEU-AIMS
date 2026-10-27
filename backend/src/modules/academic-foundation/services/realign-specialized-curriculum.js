import { DICT_SEUSL_CATALOG } from '../data/dict-seusl-catalog.js';
import { buildCatalogPlan } from './catalog-plan.js';
import { Department } from '../models/department.model.js';
import { AcademicYear } from '../models/academic-year.model.js';
import { Semester } from '../models/semester.model.js';
import { Subject } from '../models/subject.model.js';
import { CurriculumMapping } from '../models/curriculum-mapping.model.js';
import { SubjectOffering } from '../models/subject-offering.model.js';
import { StudentAcademicContext } from '../models/student-academic-context.model.js';
import { SPECIALIZATIONS } from '../constants.js';

/**
 * Years 3 and 4 in the DICT catalog belong to SWT, NST, or both.
 * A common mapping for that period makes every subject visible to every student.
 * Archive those common rows and store the catalog specialization instead.
 * Add a missing offering only where that batch already has offerings for the period
 * and a current student holds the specialization.
 */
export async function realignSpecializedCurriculum() {
  const plan = buildCatalogPlan(DICT_SEUSL_CATALOG);
  const placements = new Map();
  for (const mapping of plan.mappings) {
    if (mapping.year < 3 || !mapping.specialization) {
      continue;
    }
    const key = `${mapping.code}|${mapping.year}|${mapping.semester}`;
    if (!placements.has(key)) {
      placements.set(key, {
        code: mapping.code,
        year: mapping.year,
        semester: mapping.semester,
        specializations: new Set(),
      });
    }
    placements.get(key).specializations.add(mapping.specialization);
  }

  const departments = await Department.find({ status: 'ACTIVE' }).select('_id').lean();
  const summary = {
    departments: departments.length,
    commonArchived: 0,
    mappingsCreated: 0,
    mappingsReactivated: 0,
    offeringsCreated: 0,
    missingSubjects: 0,
  };

  for (const department of departments) {
    const departmentId = department._id;
    const [years, semesters, subjects, students] = await Promise.all([
      AcademicYear.find({ departmentId, status: 'ACTIVE' }).select('sequence').lean(),
      Semester.find({ departmentId, status: 'ACTIVE' }).select('academicYearId sequence').lean(),
      Subject.find({ departmentId, status: 'ACTIVE' }).select('code').lean(),
      StudentAcademicContext.find({ departmentId, status: 'ACTIVE' })
        .select('batchId currentAcademicYearId currentSemesterId specialization')
        .lean(),
    ]);
    const yearBySequence = new Map(years.map((year) => [year.sequence, year]));
    const semesterByKey = new Map(semesters.map((semester) => [`${semester.academicYearId}|${semester.sequence}`, semester]));
    const subjectByCode = new Map(subjects.map((subject) => [subject.code, subject]));

    const periodSubjects = new Map();
    for (const placement of placements.values()) {
      const subject = subjectByCode.get(placement.code);
      const year = yearBySequence.get(placement.year);
      const semester = year ? semesterByKey.get(`${year._id}|${placement.semester}`) : null;
      if (!subject || !year || !semester) {
        summary.missingSubjects += 1;
        continue;
      }
      const common = await CurriculumMapping.find({
        departmentId,
        subjectId: subject._id,
        academicYearId: year._id,
        semesterId: semester._id,
        specialization: null,
        status: 'ACTIVE',
      }).select('_id');
      if (common.length) {
        await CurriculumMapping.updateMany({ _id: { $in: common.map((row) => row._id) } }, { $set: { status: 'ARCHIVED' } });
        summary.commonArchived += common.length;
      }
      for (const specialization of placement.specializations) {
        const existing = await CurriculumMapping.findOne({
          departmentId,
          subjectId: subject._id,
          academicYearId: year._id,
          semesterId: semester._id,
          specialization,
        });
        if (!existing) {
          await CurriculumMapping.create({
            departmentId,
            subjectId: subject._id,
            academicYearId: year._id,
            semesterId: semester._id,
            specialization,
            status: 'ACTIVE',
          });
          summary.mappingsCreated += 1;
        } else if (existing.status !== 'ACTIVE') {
          existing.status = 'ACTIVE';
          await existing.save();
          summary.mappingsReactivated += 1;
        }
      }
      const periodKey = `${year._id}|${semester._id}`;
      if (!periodSubjects.has(periodKey)) {
        periodSubjects.set(periodKey, { yearId: year._id, semesterId: semester._id, subjects: [] });
      }
      periodSubjects.get(periodKey).subjects.push({
        subjectId: subject._id,
        specializations: [...placement.specializations],
      });
    }

    const offeringGroups = await SubjectOffering.aggregate([
      { $match: { departmentId, status: 'ACTIVE' } },
      {
        $group: {
          _id: { batchId: '$batchId', academicYearId: '$academicYearId', semesterId: '$semesterId' },
        },
      },
    ]);
    for (const group of offeringGroups) {
      const periodKey = `${group._id.academicYearId}|${group._id.semesterId}`;
      const period = periodSubjects.get(periodKey);
      if (!period) {
        continue;
      }
      const held = new Set(
        students
          .filter(
            (student) =>
              String(student.batchId) === String(group._id.batchId) &&
              String(student.currentAcademicYearId) === String(group._id.academicYearId) &&
              String(student.currentSemesterId) === String(group._id.semesterId) &&
              SPECIALIZATIONS.includes(student.specialization),
          )
          .map((student) => student.specialization),
      );
      for (const item of period.subjects) {
        if (!item.specializations.some((specialization) => held.has(specialization))) {
          continue;
        }
        const identity = {
          departmentId,
          subjectId: item.subjectId,
          batchId: group._id.batchId,
          academicYearId: group._id.academicYearId,
          semesterId: group._id.semesterId,
        };
        const existing = await SubjectOffering.findOne(identity).select('_id status');
        if (existing) {
          continue;
        }
        try {
          await SubjectOffering.create({ ...identity, status: 'ACTIVE' });
          summary.offeringsCreated += 1;
        } catch (error) {
          if (error?.code !== 11000) {
            throw error;
          }
        }
      }
    }
  }

  return summary;
}
