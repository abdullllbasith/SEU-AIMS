import mongoose from 'mongoose';
import { ENTITY_STATUSES, LECTURER_STATUSES, ACADEMIC_YEAR_SEQUENCE, SEMESTER_SEQUENCE, SPECIALIZATIONS } from '../constants.js';
import { Department } from '../models/department.model.js';
import { Batch } from '../models/batch.model.js';
import { AcademicYear } from '../models/academic-year.model.js';
import { Semester } from '../models/semester.model.js';
import { Subject } from '../models/subject.model.js';
import { CurriculumMapping } from '../models/curriculum-mapping.model.js';
import { SubjectOffering } from '../models/subject-offering.model.js';
import { SubjectEnrollment } from '../models/subject-enrollment.model.js';
import { LecturerAssignment } from '../models/lecturer-assignment.model.js';
import { StudentAcademicContext } from '../models/student-academic-context.model.js';
import { StudentAcademicHistory } from '../models/student-academic-history.model.js';
import { User } from '../../authentication/models/user.model.js';
import { AcademicResult } from '../../results/index.js';
import { recordAudit as persistAudit } from '../../audit-security/services/record-audit.service.js';
import { ROLES } from '../../../shared/constants/roles.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/app-error.js';
import {
  assertDepartmentAdmin,
  assertDepartmentScope,
  canLecturerAccessOffering,
  canStudentAccessOwnContext,
  isOfferingInStudentCurrentContext,
} from '../policies/academic.policies.js';
import { filterOfferingsForSpecialization, mappingsForOffering } from './student-specialization.service.js';
import { offeringMatchesStudentSpecialization } from '../policies/specialization.policies.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';
import { runProgressionTransaction } from './progression-transaction.js';
import { parsePagination, paginatedResult, escapeRegex } from '../utils/pagination.js';
import { requireObjectId } from '../utils/ids.js';
import {
  mapAcademicYear,
  mapAssignment,
  mapBatch,
  mapCurriculum,
  mapDepartment,
  mapHistory,
  mapMember,
  mapOffering,
  mapSemester,
  mapStudentContext,
  mapSubject,
} from '../mappers/academic.mappers.js';

const progressionLog = createLogger({ service: 'academic-foundation' });

async function recordAudit({ actorUserId, action, entityType, entityId, metadata }) {
  await persistAudit({
    actorUserId,
    action,
    entityType,
    entityId,
    metadata,
  });
}

function statusFilter(queryStatus) {
  if (!queryStatus || queryStatus === 'ALL') {
    return {};
  }
  if (!ENTITY_STATUSES.includes(queryStatus)) {
    throw new ValidationError('Invalid status');
  }
  return { status: queryStatus };
}

function textFilter(query, fields) {
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  if (!q) {
    return {};
  }
  const pattern = new RegExp(`^${escapeRegex(q)}`, 'i');
  return { $or: fields.map((field) => ({ [field]: pattern })) };
}

async function requireAdminDepartment(principal) {
  assertDepartmentAdmin(principal);
  if (!principal.departmentId) {
    throw new ValidationError('Department is not configured for this administrator');
  }
  return principal.departmentId;
}

function assertActive(entity, label) {
  if (!entity || entity.status !== 'ACTIVE') {
    throw new ValidationError(`${label} is not active`);
  }
}

async function loadScoped(Model, id, departmentId, label) {
  requireObjectId(id, label);
  const doc = await Model.findById(id);
  if (!doc || String(doc.departmentId) !== String(departmentId)) {
    throw new NotFoundError(`${label} not found`);
  }
  return doc;
}

export async function getOverview(principal) {
  const departmentId = await requireAdminDepartment(principal);
  const [
    department,
    batches,
    years,
    semesters,
    subjects,
    curriculumMappings,
    offerings,
    lecturers,
    assignments,
    students,
  ] = await Promise.all([
    Department.findById(departmentId),
    Batch.countDocuments({ departmentId }),
    AcademicYear.countDocuments({ departmentId }),
    Semester.countDocuments({ departmentId }),
    Subject.countDocuments({ departmentId }),
    CurriculumMapping.countDocuments({ departmentId }),
    SubjectOffering.countDocuments({ departmentId }),
    User.countDocuments({ departmentId, role: ROLES.LECTURER }),
    LecturerAssignment.countDocuments({ departmentId, isActive: true }),
    StudentAcademicContext.countDocuments({ departmentId }),
  ]);

  return {
    department: department ? mapDepartment(department) : null,
    counts: {
      batches,
      academicYears: years,
      semesters,
      subjects,
      curriculumMappings,
      subjectOfferings: offerings,
      lecturers,
      activeAssignments: assignments,
      studentContexts: students,
    },
  };
}

export async function listDepartments(principal) {
  assertDepartmentAdmin(principal);
  if (!principal.departmentId) {
    return { items: [] };
  }
  const department = await Department.findById(principal.departmentId);
  return { items: department ? [mapDepartment(department)] : [] };
}

export async function createDepartment(principal, body) {
  assertDepartmentAdmin(principal);
  if (principal.departmentId) {
    throw new ConflictError('This administrator already belongs to a department');
  }
  const code = String(body.code || '').trim();
  const name = String(body.name || '').trim();
  if (!code || !name) {
    throw new ValidationError('Department code and name are required');
  }

  const department = await Department.create({
    code,
    name,
    description: String(body.description || '').trim(),
    status: 'ACTIVE',
  });
  await User.findByIdAndUpdate(principal.userId, { departmentId: department._id });
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.department.create',
    entityType: 'Department',
    entityId: department._id,
    metadata: { code: department.code },
  });
  return mapDepartment(department);
}

export async function updateDepartment(principal, departmentId, body) {
  requireObjectId(departmentId, 'department');
  const department = await Department.findById(departmentId);
  if (!department) {
    throw new NotFoundError('Department not found');
  }
  assertDepartmentScope(principal, department._id);

  if (body.code !== undefined && String(body.code).trim() !== department.code) {
    throw new ValidationError('Department code cannot be changed');
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) {
      throw new ValidationError('Department name is required');
    }
    department.name = name;
  }
  if (body.description !== undefined) {
    department.description = String(body.description).trim();
  }
  if (body.status !== undefined) {
    if (!ENTITY_STATUSES.includes(body.status)) {
      throw new ValidationError('Invalid status');
    }
    department.status = body.status;
  }
  await department.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.department.update',
    entityType: 'Department',
    entityId: department._id,
    metadata: { status: department.status },
  });
  return mapDepartment(department);
}

export async function listBatches(principal, query) {
  const departmentId = await requireAdminDepartment(principal);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { departmentId, ...statusFilter(query.status), ...textFilter(query, ['code', 'name']) };
  const [items, total] = await Promise.all([
    Batch.find(filter).sort({ code: 1 }).skip(skip).limit(limit),
    Batch.countDocuments(filter),
  ]);
  return paginatedResult({ items: items.map(mapBatch), total, page, pageSize });
}

async function loadYearSemesterPair(departmentId, academicYearId, semesterId) {
  const [year, semester] = await Promise.all([
    loadScoped(AcademicYear, academicYearId, departmentId, 'Academic year'),
    loadScoped(Semester, semesterId, departmentId, 'Semester'),
  ]);
  assertActive(year, 'Academic year');
  assertActive(semester, 'Semester');
  if (String(semester.academicYearId) !== String(year._id)) {
    throw new ValidationError('Semester does not belong to the selected academic year');
  }
  return { year, semester };
}

async function loadStartingAcademicContext(departmentId) {
  const year = await AcademicYear.findOne({ departmentId, sequence: 1, status: 'ACTIVE' });
  if (!year) {
    throw new ValidationError('Create active Year 1 before creating a batch. New batches start at Year 1, Semester 1.');
  }
  const semester = await Semester.findOne({
    departmentId,
    academicYearId: year._id,
    sequence: 1,
    status: 'ACTIVE',
  });
  if (!semester) {
    throw new ValidationError('Create active Semester 1 of Year 1 before creating a batch.');
  }
  return { year, semester };
}

export async function createBatch(principal, body) {
  const departmentId = await requireAdminDepartment(principal);
  const department = await Department.findById(departmentId);
  assertActive(department, 'Department');
  const code = String(body.code || '').trim();
  const name = String(body.name || '').trim();
  if (!code || !name) {
    throw new ValidationError('Batch code and name are required');
  }
  if (body.currentAcademicYearId !== undefined || body.currentSemesterId !== undefined) {
    throw new ValidationError('A new batch starts at Year 1, Semester 1. Do not send a different academic period.');
  }
  const { year, semester } = await loadStartingAcademicContext(departmentId);
  const batch = await Batch.create({
    departmentId,
    code,
    name,
    status: 'ACTIVE',
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
    academicContextVerifiedAt: new Date(),
  });
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.batch.create',
    entityType: 'Batch',
    entityId: batch._id,
    metadata: { code: batch.code },
  });
  return mapBatch(batch);
}

export async function updateBatch(principal, batchId, body) {
  const departmentId = await requireAdminDepartment(principal);
  const batch = await loadScoped(Batch, batchId, departmentId, 'Batch');
  if (body.currentAcademicYearId !== undefined || body.currentSemesterId !== undefined) {
    throw new ValidationError(
      'Batch academic context cannot be changed here. Assign it once while it is unverified. Later changes belong to batch progression.',
    );
  }
  if (body.code !== undefined && String(body.code).trim() !== batch.code) {
    throw new ValidationError('Batch code cannot be changed');
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) {
      throw new ValidationError('Batch name is required');
    }
    batch.name = name;
  }
  if (body.status !== undefined) {
    if (!ENTITY_STATUSES.includes(body.status)) {
      throw new ValidationError('Invalid status');
    }
    batch.status = body.status;
  }
  if (body.specialization !== undefined) {
    if (body.specialization === null || body.specialization === '') {
      batch.specialization = null;
    } else {
      const specialization = String(body.specialization).trim().toUpperCase();
      if (!SPECIALIZATIONS.includes(specialization)) {
        throw new ValidationError('Specialization must be SWT, NST, or empty');
      }
      batch.specialization = specialization;
    }
  }
  await batch.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.batch.update',
    entityType: 'Batch',
    entityId: batch._id,
    metadata: { status: batch.status, specialization: batch.specialization || null },
  });
  return mapBatch(batch);
}

async function presentBatch(batch) {
  const [studentCount, year, semester] = await Promise.all([
    StudentAcademicContext.countDocuments({ batchId: batch._id, departmentId: batch.departmentId }),
    batch.currentAcademicYearId
      ? AcademicYear.findById(batch.currentAcademicYearId).select('name sequence status').lean()
      : null,
    batch.currentSemesterId
      ? Semester.findById(batch.currentSemesterId).select('name sequence academicYearId status').lean()
      : null,
  ]);
  return {
    ...mapBatch(batch),
    studentCount,
    currentAcademicYearName: year?.name || '',
    currentAcademicYearSequence: year?.sequence ?? null,
    currentSemesterName: semester?.name || '',
    currentSemesterSequence: semester?.sequence ?? null,
  };
}

export async function getBatch(principal, batchId) {
  const departmentId = await requireAdminDepartment(principal);
  const batch = await loadScoped(Batch, batchId, departmentId, 'Batch');
  return presentBatch(batch);
}

const ALREADY_VERIFIED_CONTEXT =
  'This batch already has a verified academic context. Changing it is reserved for batch progression.';

// MongoDB `{ field: null }` matches both an explicit null and a missing field.
// The `$exists: false` branch is kept so a legacy document is still eligible if a
// driver or cast layer treats equality-null as "stored null" only.
function unsetContextField(path) {
  return {
    $or: [{ [path]: null }, { [path]: { $exists: false } }],
  };
}

export async function assignBatchAcademicContext(principal, batchId, body) {
  const departmentId = await requireAdminDepartment(principal);
  const batch = await loadScoped(Batch, batchId, departmentId, 'Batch');
  assertActive(batch, 'Batch');
  if (batch.currentAcademicYearId || batch.currentSemesterId || batch.academicContextVerifiedAt) {
    throw new ConflictError(ALREADY_VERIFIED_CONTEXT);
  }
  const { year, semester } = await loadYearSemesterPair(
    departmentId,
    body.currentAcademicYearId,
    body.currentSemesterId,
  );
  const verifiedAt = new Date();
  const updated = await Batch.findOneAndUpdate(
    {
      _id: batch._id,
      departmentId: batch.departmentId,
      status: 'ACTIVE',
      $and: [
        unsetContextField('currentAcademicYearId'),
        unsetContextField('currentSemesterId'),
        unsetContextField('academicContextVerifiedAt'),
      ],
    },
    {
      $set: {
        currentAcademicYearId: year._id,
        currentSemesterId: semester._id,
        academicContextVerifiedAt: verifiedAt,
      },
    },
    { new: true },
  );
  if (!updated) {
    const current = await loadScoped(Batch, batchId, departmentId, 'Batch');
    assertActive(current, 'Batch');
    throw new ConflictError(ALREADY_VERIFIED_CONTEXT);
  }
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.batch.assign-context',
    entityType: 'Batch',
    entityId: updated._id,
    metadata: { academicYearId: String(year._id), semesterId: String(semester._id) },
  });
  return presentBatch(updated);
}

export async function listAcademicYears(principal, query) {
  const departmentId = await requireAdminDepartment(principal);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { departmentId, ...statusFilter(query.status) };
  const [items, total] = await Promise.all([
    AcademicYear.find(filter).sort({ sequence: 1 }).skip(skip).limit(limit),
    AcademicYear.countDocuments(filter),
  ]);
  return paginatedResult({ items: items.map(mapAcademicYear), total, page, pageSize });
}

export async function createAcademicYear(principal, body) {
  const departmentId = await requireAdminDepartment(principal);
  const department = await Department.findById(departmentId);
  assertActive(department, 'Department');
  const sequence = Number(body.sequence);
  const name = String(body.name || '').trim();
  if (!ACADEMIC_YEAR_SEQUENCE.includes(sequence) || !name) {
    throw new ValidationError('Academic year sequence must be 1-4 and name is required');
  }
  let year;
  try {
    year = await AcademicYear.create({ departmentId, sequence, name, status: 'ACTIVE' });
  } catch (error) {
    if (duplicateKey(error)) {
      throw new ConflictError('This department already has an academic year with that sequence');
    }
    throw error;
  }
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.year.create',
    entityType: 'AcademicYear',
    entityId: year._id,
    metadata: { sequence },
  });
  return mapAcademicYear(year);
}

export async function updateAcademicYear(principal, yearId, body) {
  const departmentId = await requireAdminDepartment(principal);
  const year = await loadScoped(AcademicYear, yearId, departmentId, 'Academic year');
  if (body.sequence !== undefined && Number(body.sequence) !== year.sequence) {
    throw new ValidationError('Academic year sequence cannot be changed');
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) {
      throw new ValidationError('Academic year name is required');
    }
    year.name = name;
  }
  if (body.status !== undefined) {
    if (!ENTITY_STATUSES.includes(body.status)) {
      throw new ValidationError('Invalid status');
    }
    if (body.status === 'ARCHIVED' && year.status !== 'ARCHIVED') {
      await assertAcademicYearArchiveAllowed(departmentId, year);
    }
    year.status = body.status;
  }
  await year.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.year.update',
    entityType: 'AcademicYear',
    entityId: year._id,
    metadata: { status: year.status },
  });
  return mapAcademicYear(year);
}

export async function listSemesters(principal, query) {
  const departmentId = await requireAdminDepartment(principal);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { departmentId, ...statusFilter(query.status) };
  if (query.academicYearId) {
    requireObjectId(query.academicYearId, 'academic year');
    filter.academicYearId = query.academicYearId;
  }
  const [items, total] = await Promise.all([
    Semester.find(filter).sort({ academicYearId: 1, sequence: 1 }).skip(skip).limit(limit),
    Semester.countDocuments(filter),
  ]);
  return paginatedResult({ items: items.map(mapSemester), total, page, pageSize });
}

export async function createSemester(principal, body) {
  const departmentId = await requireAdminDepartment(principal);
  const year = await loadScoped(AcademicYear, body.academicYearId, departmentId, 'Academic year');
  assertActive(year, 'Academic year');
  const sequence = Number(body.sequence);
  const name = String(body.name || '').trim();
  if (!SEMESTER_SEQUENCE.includes(sequence) || !name) {
    throw new ValidationError('Semester sequence must be 1 or 2 and name is required');
  }
  const existing = await Semester.findOne({ academicYearId: year._id, sequence });
  if (existing) {
    throw new ConflictError('This academic year already has a semester with that sequence');
  }
  const semester = await Semester.create({
    departmentId,
    academicYearId: year._id,
    sequence,
    name,
    status: 'ACTIVE',
  });
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.semester.create',
    entityType: 'Semester',
    entityId: semester._id,
    metadata: { sequence, academicYearId: String(year._id) },
  });
  return mapSemester(semester);
}

export async function updateSemester(principal, semesterId, body) {
  const departmentId = await requireAdminDepartment(principal);
  const semester = await loadScoped(Semester, semesterId, departmentId, 'Semester');
  if (body.sequence !== undefined && Number(body.sequence) !== semester.sequence) {
    throw new ValidationError('Semester sequence cannot be changed');
  }
  if (body.academicYearId !== undefined && String(body.academicYearId) !== String(semester.academicYearId)) {
    throw new ValidationError('Semester academic year cannot be changed');
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) {
      throw new ValidationError('Semester name is required');
    }
    semester.name = name;
  }
  if (body.status !== undefined) {
    if (!ENTITY_STATUSES.includes(body.status)) {
      throw new ValidationError('Invalid status');
    }
    if (body.status === 'ARCHIVED' && semester.status !== 'ARCHIVED') {
      await assertSemesterArchiveAllowed(departmentId, semester);
    }
    semester.status = body.status;
  }
  await semester.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.semester.update',
    entityType: 'Semester',
    entityId: semester._id,
    metadata: { status: semester.status },
  });
  return mapSemester(semester);
}

async function semesterReferenceCounts(semesterId) {
  const id = semesterId;
  const [
    batches,
    studentContexts,
    offerings,
    curriculumMappings,
    historyRows,
    officialResults,
  ] = await Promise.all([
    Batch.countDocuments({ currentSemesterId: id }),
    StudentAcademicContext.countDocuments({ currentSemesterId: id }),
    SubjectOffering.countDocuments({ semesterId: id }),
    CurriculumMapping.countDocuments({ semesterId: id }),
    StudentAcademicHistory.countDocuments({ semesterId: id }),
    AcademicResult.countDocuments({ studentSemesterId: id }),
  ]);
  return {
    batches,
    studentContexts,
    offerings,
    curriculumMappings,
    historyRows,
    officialResults,
  };
}

async function academicYearReferenceCounts(yearId) {
  const id = yearId;
  const [semesters, batches, studentContexts, offerings, curriculumMappings, historyRows, officialResults] =
    await Promise.all([
      Semester.countDocuments({ academicYearId: id }),
      Batch.countDocuments({ currentAcademicYearId: id }),
      StudentAcademicContext.countDocuments({ currentAcademicYearId: id }),
      SubjectOffering.countDocuments({ academicYearId: id }),
      CurriculumMapping.countDocuments({ academicYearId: id }),
      StudentAcademicHistory.countDocuments({ academicYearId: id }),
      AcademicResult.countDocuments({ studentAcademicYearId: id }),
    ]);
  return {
    semesters,
    batches,
    studentContexts,
    offerings,
    curriculumMappings,
    historyRows,
    officialResults,
  };
}

function assertNoSemesterReferences(counts) {
  const total =
    counts.batches +
    counts.studentContexts +
    counts.offerings +
    counts.curriculumMappings +
    counts.historyRows +
    counts.officialResults;
  if (total > 0) {
    throw new ConflictError(
      'This semester is still referenced by batches, students, offerings, curriculum, history, or official results.',
    );
  }
}

function assertNoAcademicYearReferences(counts) {
  if (counts.semesters > 0) {
    throw new ConflictError('Delete all semesters in this academic year before deleting the year.');
  }
  const total =
    counts.batches +
    counts.studentContexts +
    counts.offerings +
    counts.curriculumMappings +
    counts.historyRows +
    counts.officialResults;
  if (total > 0) {
    throw new ConflictError(
      'This academic year is still referenced by batches, students, offerings, curriculum, history, or official results.',
    );
  }
}

export async function deleteSemester(principal, semesterId) {
  const departmentId = await requireAdminDepartment(principal);
  const semester = await loadScoped(Semester, semesterId, departmentId, 'Semester');
  if (semester.status !== 'ARCHIVED') {
    throw new ValidationError('Archive this semester before deleting it.');
  }
  assertNoSemesterReferences(await semesterReferenceCounts(semester._id));
  await semester.deleteOne();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.semester.delete',
    entityType: 'Semester',
    entityId: semester._id,
    metadata: { academicYearId: String(semester.academicYearId), sequence: semester.sequence },
  });
  return { id: String(semester._id), deleted: true };
}

export async function deleteAcademicYear(principal, yearId) {
  const departmentId = await requireAdminDepartment(principal);
  const year = await loadScoped(AcademicYear, yearId, departmentId, 'Academic year');
  if (year.status !== 'ARCHIVED') {
    throw new ValidationError('Archive this academic year before deleting it.');
  }
  assertNoAcademicYearReferences(await academicYearReferenceCounts(year._id));
  await year.deleteOne();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.year.delete',
    entityType: 'AcademicYear',
    entityId: year._id,
    metadata: { sequence: year.sequence },
  });
  return { id: String(year._id), deleted: true };
}

export async function listSubjects(principal, query) {
  const departmentId = await requireAdminDepartment(principal);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { departmentId, ...statusFilter(query.status), ...textFilter(query, ['code', 'name']) };
  const [items, total] = await Promise.all([
    Subject.find(filter).sort({ code: 1 }).skip(skip).limit(limit),
    Subject.countDocuments(filter),
  ]);
  return paginatedResult({ items: items.map(mapSubject), total, page, pageSize });
}

export async function createSubject(principal, body) {
  const departmentId = await requireAdminDepartment(principal);
  const department = await Department.findById(departmentId);
  assertActive(department, 'Department');
  const code = String(body.code || '').trim().toUpperCase();
  const name = String(body.name || '').trim();
  const credits = Number(body.credits);
  if (!code || !name || Number.isNaN(credits) || credits < 0) {
    throw new ValidationError('Subject code, name, and non-negative credits are required');
  }
  const subject = await Subject.create({ departmentId, code, name, credits, status: 'ACTIVE' });
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.subject.create',
    entityType: 'Subject',
    entityId: subject._id,
    metadata: { code: subject.code },
  });
  return mapSubject(subject);
}

export async function updateSubject(principal, subjectId, body) {
  const departmentId = await requireAdminDepartment(principal);
  const subject = await loadScoped(Subject, subjectId, departmentId, 'Subject');
  if (body.code !== undefined && String(body.code).trim().toUpperCase() !== subject.code) {
    throw new ValidationError('Subject code cannot be changed');
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) {
      throw new ValidationError('Subject name is required');
    }
    subject.name = name;
  }
  if (body.credits !== undefined) {
    const credits = Number(body.credits);
    if (Number.isNaN(credits) || credits < 0) {
      throw new ValidationError('Credits must be non-negative');
    }
    subject.credits = credits;
  }
  if (body.status !== undefined) {
    if (!ENTITY_STATUSES.includes(body.status)) {
      throw new ValidationError('Invalid status');
    }
    subject.status = body.status;
  }
  await subject.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.subject.update',
    entityType: 'Subject',
    entityId: subject._id,
    metadata: { status: subject.status },
  });
  return mapSubject(subject);
}

async function assertOfferingRefs({ departmentId, subjectId, batchId, academicYearId, semesterId }) {
  const [subject, batch, year, semester] = await Promise.all([
    loadScoped(Subject, subjectId, departmentId, 'Subject'),
    loadScoped(Batch, batchId, departmentId, 'Batch'),
    loadScoped(AcademicYear, academicYearId, departmentId, 'Academic year'),
    loadScoped(Semester, semesterId, departmentId, 'Semester'),
  ]);
  assertActive(subject, 'Subject');
  assertActive(batch, 'Batch');
  assertActive(year, 'Academic year');
  assertActive(semester, 'Semester');
  if (String(semester.academicYearId) !== String(year._id)) {
    throw new ValidationError('Semester does not belong to the selected academic year');
  }
  return { subject, batch, year, semester };
}

async function applyPeriodFilters(departmentId, query, filter) {
  if (query.academicYearId) {
    requireObjectId(query.academicYearId, 'academicYearId');
    filter.academicYearId = query.academicYearId;
  }
  if (query.semesterId) {
    requireObjectId(query.semesterId, 'semesterId');
    filter.semesterId = query.semesterId;
    return;
  }
  if (query.semesterSequence === undefined || query.semesterSequence === null || query.semesterSequence === '') {
    return;
  }
  const sequence = Number(query.semesterSequence);
  if (!SEMESTER_SEQUENCE.includes(sequence)) {
    throw new ValidationError('Semester filter must be 1 or 2');
  }
  const semesterQuery = { departmentId, sequence };
  if (filter.academicYearId) {
    semesterQuery.academicYearId = filter.academicYearId;
  }
  const semesters = await Semester.find(semesterQuery).select('_id');
  filter.semesterId = { $in: semesters.map((item) => item._id) };
}

function castMatchValue(value) {
  if (value && typeof value === 'object' && Array.isArray(value.$in)) {
    return { $in: value.$in.map((item) => new mongoose.Types.ObjectId(String(item))) };
  }
  if (value == null || typeof value === 'object') {
    return value;
  }
  if (mongoose.isValidObjectId(value)) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return value;
}

function aggregateMatch(filter) {
  const match = { ...filter };
  for (const field of ['departmentId', 'subjectId', 'batchId', 'academicYearId', 'semesterId']) {
    if (match[field] !== undefined) {
      match[field] = castMatchValue(match[field]);
    }
  }
  return match;
}

async function findOrderedByPeriod(Model, filter, { skip, limit }) {
  const [items, total] = await Promise.all([
    Model.aggregate([
      { $match: aggregateMatch(filter) },
      {
        $lookup: {
          from: AcademicYear.collection.name,
          localField: 'academicYearId',
          foreignField: '_id',
          as: 'yearDoc',
        },
      },
      {
        $lookup: {
          from: Semester.collection.name,
          localField: 'semesterId',
          foreignField: '_id',
          as: 'semesterDoc',
        },
      },
      {
        $lookup: {
          from: Subject.collection.name,
          localField: 'subjectId',
          foreignField: '_id',
          as: 'subjectDoc',
        },
      },
      {
        $addFields: {
          yearSequence: { $ifNull: [{ $arrayElemAt: ['$yearDoc.sequence', 0] }, 99] },
          semesterSequence: { $ifNull: [{ $arrayElemAt: ['$semesterDoc.sequence', 0] }, 99] },
          subjectCode: { $ifNull: [{ $arrayElemAt: ['$subjectDoc.code', 0] }, ''] },
          subjectId: { $ifNull: [{ $arrayElemAt: ['$subjectDoc', 0] }, '$subjectId'] },
        },
      },
      { $project: { yearDoc: 0, semesterDoc: 0, subjectDoc: 0 } },
      { $sort: { yearSequence: 1, semesterSequence: 1, subjectCode: 1, _id: 1 } },
      { $skip: skip },
      { $limit: limit },
    ]),
    Model.countDocuments(filter),
  ]);
  return { items, total };
}

export async function listOfferings(principal, query) {
  const departmentId = await requireAdminDepartment(principal);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { departmentId, ...statusFilter(query.status) };
  for (const field of ['subjectId', 'batchId']) {
    if (query[field]) {
      requireObjectId(query[field], field);
      filter[field] = query[field];
    }
  }
  await applyPeriodFilters(departmentId, query, filter);
  const { items, total } = await findOrderedByPeriod(SubjectOffering, filter, { skip, limit });
  return paginatedResult({ items: items.map(mapOffering), total, page, pageSize });
}

export async function createOffering(principal, body) {
  const departmentId = await requireAdminDepartment(principal);
  await assertOfferingRefs({
    departmentId,
    subjectId: body.subjectId,
    batchId: body.batchId,
    academicYearId: body.academicYearId,
    semesterId: body.semesterId,
  });
  const existing = await SubjectOffering.findOne({
    subjectId: body.subjectId,
    batchId: body.batchId,
    academicYearId: body.academicYearId,
    semesterId: body.semesterId,
  });
  if (existing) {
    throw new ConflictError('This subject is already offered for that batch, year, and semester');
  }
  const offering = await SubjectOffering.create({
    departmentId,
    subjectId: body.subjectId,
    batchId: body.batchId,
    academicYearId: body.academicYearId,
    semesterId: body.semesterId,
    status: 'ACTIVE',
  });
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.offering.create',
    entityType: 'SubjectOffering',
    entityId: offering._id,
    metadata: { subjectId: String(offering.subjectId) },
  });
  return mapOffering(offering);
}

export async function getOffering(principal, offeringId) {
  requireObjectId(offeringId, 'offering');
  const offering = await SubjectOffering.findById(offeringId);
  if (!offering) {
    throw new NotFoundError('Subject offering not found');
  }

  if (principal.role === ROLES.DEPARTMENT_ADMINISTRATOR) {
    assertDepartmentScope(principal, offering.departmentId);
    return mapOffering(offering);
  }

  if (principal.role === ROLES.LECTURER) {
    const assignment = await LecturerAssignment.findOne({
      lecturerUserId: principal.userId,
      subjectOfferingId: offering._id,
      isActive: true,
    });
    if (!canLecturerAccessOffering(principal, assignment)) {
      throw new ForbiddenError('Forbidden');
    }
    return mapOffering(offering);
  }

  if (principal.role === ROLES.STUDENT) {
    const context = await StudentAcademicContext.findOne({ userId: principal.userId });
    if (!isOfferingInStudentCurrentContext(context, offering) || offering.status !== 'ACTIVE') {
      throw new ForbiddenError('Forbidden');
    }
    const mappings = await mappingsForOffering(offering);
    if (!offeringMatchesStudentSpecialization(context.specialization, mappings)) {
      throw new ForbiddenError('Forbidden');
    }
    return mapOffering(offering);
  }

  throw new ForbiddenError('Forbidden');
}

export async function updateOffering(principal, offeringId, body) {
  const departmentId = await requireAdminDepartment(principal);
  const offering = await loadScoped(SubjectOffering, offeringId, departmentId, 'Subject offering');
  const identityFields = ['subjectId', 'batchId', 'academicYearId', 'semesterId'];
  for (const field of identityFields) {
    if (body[field] !== undefined && String(body[field]) !== String(offering[field])) {
      throw new ValidationError('Subject offering identity cannot be changed');
    }
  }
  if (body.status !== undefined) {
    if (!ENTITY_STATUSES.includes(body.status)) {
      throw new ValidationError('Invalid status');
    }
    offering.status = body.status;
  }
  await offering.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.offering.update',
    entityType: 'SubjectOffering',
    entityId: offering._id,
    metadata: { status: offering.status },
  });
  return mapOffering(offering);
}

function duplicateKey(error) {
  return error?.code === 11000;
}

async function activeVerifiedBatches(departmentId) {
  return Batch.find({
    departmentId,
    status: 'ACTIVE',
    academicContextVerifiedAt: { $ne: null },
    currentAcademicYearId: { $ne: null },
    currentSemesterId: { $ne: null },
  }).select('currentAcademicYearId currentSemesterId code');
}

function nextPeriodSequences(yearSequence, semesterSequence) {
  if (yearSequence === 4 && semesterSequence === 2) {
    return null;
  }
  return {
    yearSequence: semesterSequence === 1 ? yearSequence : yearSequence + 1,
    semesterSequence: semesterSequence === 1 ? 2 : 1,
  };
}

async function assertAcademicYearArchiveAllowed(departmentId, year) {
  const current = await Batch.countDocuments({
    departmentId,
    status: 'ACTIVE',
    currentAcademicYearId: year._id,
  });
  if (current > 0) {
    throw new ConflictError(
      'Archive is blocked because an active batch is currently in this academic year.',
    );
  }
  const batches = await activeVerifiedBatches(departmentId);
  if (!batches.length) {
    return;
  }
  const years = await AcademicYear.find({
    _id: { $in: batches.map((batch) => batch.currentAcademicYearId) },
  }).select('sequence');
  const semesters = await Semester.find({
    _id: { $in: batches.map((batch) => batch.currentSemesterId) },
  }).select('sequence academicYearId');
  const yearById = new Map(years.map((item) => [String(item._id), item]));
  const semesterById = new Map(semesters.map((item) => [String(item._id), item]));
  for (const batch of batches) {
    const currentYear = yearById.get(String(batch.currentAcademicYearId));
    const currentSemester = semesterById.get(String(batch.currentSemesterId));
    if (!currentYear || !currentSemester) {
      continue;
    }
    const next = nextPeriodSequences(currentYear.sequence, currentSemester.sequence);
    if (next && next.yearSequence === year.sequence) {
      throw new ConflictError(
        'Archive is blocked because an active batch needs this academic year for the next progression step.',
      );
    }
  }
}

async function assertSemesterArchiveAllowed(departmentId, semester) {
  const current = await Batch.countDocuments({
    departmentId,
    status: 'ACTIVE',
    currentSemesterId: semester._id,
  });
  if (current > 0) {
    throw new ConflictError(
      'Archive is blocked because an active batch is currently in this semester.',
    );
  }
  const year = await AcademicYear.findById(semester.academicYearId).select('sequence');
  if (!year) {
    return;
  }
  const batches = await activeVerifiedBatches(departmentId);
  if (!batches.length) {
    return;
  }
  const years = await AcademicYear.find({
    _id: { $in: batches.map((batch) => batch.currentAcademicYearId) },
  }).select('sequence');
  const semesters = await Semester.find({
    _id: { $in: batches.map((batch) => batch.currentSemesterId) },
  }).select('sequence');
  const yearById = new Map(years.map((item) => [String(item._id), item]));
  const semesterById = new Map(semesters.map((item) => [String(item._id), item]));
  for (const batch of batches) {
    const currentYear = yearById.get(String(batch.currentAcademicYearId));
    const currentSemester = semesterById.get(String(batch.currentSemesterId));
    if (!currentYear || !currentSemester) {
      continue;
    }
    const next = nextPeriodSequences(currentYear.sequence, currentSemester.sequence);
    if (
      next &&
      next.yearSequence === year.sequence &&
      next.semesterSequence === semester.sequence
    ) {
      throw new ConflictError(
        'Archive is blocked because an active batch needs this semester for the next progression step.',
      );
    }
  }
}

function normalizeMappingSpecialization(value, yearSequence) {
  const empty = value === undefined || value === null || value === '';
  if (yearSequence <= 2) {
    if (!empty) {
      throw new ValidationError('Years 1 and 2 use the common curriculum and cannot take a specialization');
    }
    return null;
  }
  if (empty) {
    throw new ValidationError('Years 3 and 4 require specialization SWT or NST');
  }
  const specialization = String(value).trim().toUpperCase();
  if (!SPECIALIZATIONS.includes(specialization)) {
    throw new ValidationError('Specialization must be SWT or NST');
  }
  return specialization;
}

async function assertCurriculumRefs(departmentId, body) {
  const subject = await loadScoped(Subject, body.subjectId, departmentId, 'Subject');
  const { year, semester } = await loadYearSemesterPair(departmentId, body.academicYearId, body.semesterId);
  assertActive(subject, 'Subject');
  return { subject, year, semester };
}

export async function listCurriculumMappings(principal, query) {
  const departmentId = await requireAdminDepartment(principal);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { departmentId, ...statusFilter(query.status) };
  if (query.subjectId) {
    requireObjectId(query.subjectId, 'subjectId');
    filter.subjectId = query.subjectId;
  }
  await applyPeriodFilters(departmentId, query, filter);
  const { items, total } = await findOrderedByPeriod(CurriculumMapping, filter, { skip, limit });
  return paginatedResult({ items: items.map(mapCurriculum), total, page, pageSize });
}

export async function createCurriculumMapping(principal, body) {
  const departmentId = await requireAdminDepartment(principal);
  const department = await Department.findById(departmentId);
  assertActive(department, 'Department');
  const { subject, year, semester } = await assertCurriculumRefs(departmentId, body);
  const specialization = normalizeMappingSpecialization(body.specialization, year.sequence);
  const existing = await CurriculumMapping.findOne({
    departmentId,
    subjectId: subject._id,
    academicYearId: year._id,
    semesterId: semester._id,
    specialization,
  });
  if (existing) {
    throw new ConflictError('This subject is already mapped to that academic year, semester, and specialization');
  }
  let mapping;
  try {
    mapping = await CurriculumMapping.create({
      departmentId,
      subjectId: subject._id,
      academicYearId: year._id,
      semesterId: semester._id,
      specialization,
      status: 'ACTIVE',
    });
  } catch (error) {
    if (duplicateKey(error)) {
      throw new ConflictError('This subject is already mapped to that academic year, semester, and specialization');
    }
    throw error;
  }
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.curriculum.create',
    entityType: 'CurriculumMapping',
    entityId: mapping._id,
    metadata: {
      subjectId: String(subject._id),
      academicYearId: String(year._id),
      semesterId: String(semester._id),
      specialization,
    },
  });
  return mapCurriculum(mapping);
}

export async function updateCurriculumMapping(principal, mappingId, body) {
  const departmentId = await requireAdminDepartment(principal);
  const mapping = await loadScoped(CurriculumMapping, mappingId, departmentId, 'Curriculum mapping');
  for (const field of ['subjectId', 'academicYearId', 'semesterId', 'departmentId', 'specialization']) {
    if (body[field] !== undefined && String(body[field]) !== String(mapping[field])) {
      throw new ValidationError('Curriculum mapping identity cannot be changed');
    }
  }
  if (body.status !== undefined) {
    if (!ENTITY_STATUSES.includes(body.status)) {
      throw new ValidationError('Invalid status');
    }
    if (body.status === 'ACTIVE') {
      await assertCurriculumRefs(departmentId, {
        subjectId: mapping.subjectId,
        academicYearId: mapping.academicYearId,
        semesterId: mapping.semesterId,
      });
    }
    mapping.status = body.status;
  }
  await mapping.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.curriculum.update',
    entityType: 'CurriculumMapping',
    entityId: mapping._id,
    metadata: { status: mapping.status },
  });
  return mapCurriculum(mapping);
}

async function resolveBatchGenerationTarget(principal, batchId) {
  const departmentId = await requireAdminDepartment(principal);
  const batch = await loadScoped(Batch, batchId, departmentId, 'Batch');
  assertActive(batch, 'Batch');
  if (!batch.academicContextVerifiedAt || !batch.currentAcademicYearId || !batch.currentSemesterId) {
    throw new ValidationError('Assign a verified academic context before generating offerings.');
  }
  const { year, semester } = await loadYearSemesterPair(
    departmentId,
    batch.currentAcademicYearId,
    batch.currentSemesterId,
  );
  return { departmentId, batch, year, semester };
}

async function heldSpecializations(batch, year, semester) {
  const rows = await StudentAcademicContext.find({
    departmentId: batch.departmentId,
    batchId: batch._id,
    status: 'ACTIVE',
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
    specialization: { $in: SPECIALIZATIONS },
  }).select('specialization');
  return new Set(rows.map((row) => row.specialization));
}

async function activeCurriculumForPeriod(departmentId, year, semester, batch) {
  const mappings = await CurriculumMapping.find({
    departmentId,
    academicYearId: year._id,
    semesterId: semester._id,
    status: 'ACTIVE',
  }).sort({ createdAt: 1 });
  const held = await heldSpecializations(batch, year, semester);
  const ready = [];
  const skipped = [];
  for (const mapping of mappings) {
    const mappingSpecialization = mapping.specialization || null;
    if (mappingSpecialization && !held.has(mappingSpecialization)) {
      skipped.push({
        mappingId: String(mapping._id),
        subjectId: String(mapping.subjectId),
        specialization: mappingSpecialization,
        reason: 'NO_STUDENT_WITH_SPECIALIZATION',
      });
      continue;
    }
    const subject = await Subject.findById(mapping.subjectId);
    if (!subject || String(subject.departmentId) !== String(departmentId)) {
      skipped.push({
        mappingId: String(mapping._id),
        subjectId: String(mapping.subjectId),
        reason: 'SUBJECT_NOT_FOUND',
      });
      continue;
    }
    if (subject.status !== 'ACTIVE') {
      skipped.push({
        mappingId: String(mapping._id),
        subjectId: String(subject._id),
        subjectCode: subject.code,
        subjectName: subject.name,
        reason: 'SUBJECT_NOT_ACTIVE',
      });
      continue;
    }
    ready.push({ mapping, subject });
  }
  return { ready, skipped };
}

function generationTarget(batch, year, semester) {
  return {
    batchId: String(batch._id),
    batchCode: batch.code,
    batchName: batch.name,
    batchStatus: batch.status,
    specialization: batch.specialization || null,
    academicYearId: String(year._id),
    academicYearName: year.name,
    academicYearSequence: year.sequence,
    semesterId: String(semester._id),
    semesterName: semester.name,
    semesterSequence: semester.sequence,
  };
}

export async function previewBatchOfferings(principal, batchId) {
  const { departmentId, batch, year, semester } = await resolveBatchGenerationTarget(principal, batchId);
  const { ready, skipped } = await activeCurriculumForPeriod(departmentId, year, semester, batch);
  const existing = await SubjectOffering.find({
    departmentId,
    batchId: batch._id,
    academicYearId: year._id,
    semesterId: semester._id,
    subjectId: { $in: ready.map((item) => item.subject._id) },
  }).select('subjectId status');
  const existingBySubject = new Map(existing.map((offering) => [String(offering.subjectId), offering]));
  return {
    ...generationTarget(batch, year, semester),
    subjects: ready.map(({ mapping, subject }) => {
      const offering = existingBySubject.get(String(subject._id));
      return {
        mappingId: String(mapping._id),
        subjectId: String(subject._id),
        subjectCode: subject.code,
        subjectName: subject.name,
        offeringExists: Boolean(offering),
        offeringId: offering ? String(offering._id) : null,
        offeringStatus: offering?.status || null,
      };
    }),
    skipped,
  };
}

export async function generateBatchOfferings(principal, batchId) {
  const { departmentId, batch, year, semester } = await resolveBatchGenerationTarget(principal, batchId);
  const { ready, skipped } = await activeCurriculumForPeriod(departmentId, year, semester, batch);
  const created = [];
  const alreadyExisted = [];
  for (const { subject } of ready) {
    const identity = {
      subjectId: subject._id,
      batchId: batch._id,
      academicYearId: year._id,
      semesterId: semester._id,
    };
    const existing = await SubjectOffering.findOne(identity);
    if (existing) {
      alreadyExisted.push({
        subjectId: String(subject._id),
        subjectCode: subject.code,
        subjectName: subject.name,
        offeringId: String(existing._id),
        offeringStatus: existing.status,
      });
      continue;
    }
    try {
      const offering = await SubjectOffering.create({
        departmentId,
        ...identity,
        status: 'ACTIVE',
      });
      created.push({
        subjectId: String(subject._id),
        subjectCode: subject.code,
        subjectName: subject.name,
        offeringId: String(offering._id),
      });
    } catch (error) {
      if (!duplicateKey(error)) {
        throw error;
      }
      const raced = await SubjectOffering.findOne(identity);
      alreadyExisted.push({
        subjectId: String(subject._id),
        subjectCode: subject.code,
        subjectName: subject.name,
        offeringId: raced ? String(raced._id) : null,
        offeringStatus: raced?.status || null,
      });
    }
  }
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.offering.generate',
    entityType: 'Batch',
    entityId: batch._id,
    metadata: {
      academicYearId: String(year._id),
      semesterId: String(semester._id),
      created: created.length,
      alreadyExisted: alreadyExisted.length,
      skipped: skipped.length,
    },
  });
  return {
    ...generationTarget(batch, year, semester),
    created: created.length,
    alreadyExisted: alreadyExisted.length,
    skipped: skipped.length,
    createdSubjects: created,
    existingSubjects: alreadyExisted,
    skippedSubjects: skipped,
  };
}

const TERMINAL_PROGRESSION =
  'This batch is in Year 4, Semester 2. Further progression is not available.';

async function describePeriod(year, semester) {
  return {
    academicYearId: String(year._id),
    academicYearName: year.name,
    academicYearSequence: year.sequence,
    semesterId: String(semester._id),
    semesterName: semester.name,
    semesterSequence: semester.sequence,
  };
}

async function resolveNextAcademicPeriod(departmentId, year, semester) {
  if (year.sequence === 4 && semester.sequence === 2) {
    return null;
  }
  const nextYearSequence = semester.sequence === 1 ? year.sequence : year.sequence + 1;
  const nextSemesterSequence = semester.sequence === 1 ? 2 : 1;
  const nextYear = await AcademicYear.findOne({
    departmentId,
    sequence: nextYearSequence,
    status: 'ACTIVE',
  });
  const nextSemester = nextYear
    ? await Semester.findOne({
        departmentId,
        academicYearId: nextYear._id,
        sequence: nextSemesterSequence,
        status: 'ACTIVE',
      })
    : null;
  if (!nextYear || !nextSemester) {
    throw new ValidationError(
      `Create active Year ${nextYearSequence}, Semester ${nextSemesterSequence} before progressing this batch.`,
    );
  }
  return { year: nextYear, semester: nextSemester, nextYearSequence, nextSemesterSequence };
}

async function loadProgressionSource(principal, batchId) {
  const departmentId = await requireAdminDepartment(principal);
  const batch = await loadScoped(Batch, batchId, departmentId, 'Batch');
  assertActive(batch, 'Batch');
  if (!batch.academicContextVerifiedAt || !batch.currentAcademicYearId || !batch.currentSemesterId) {
    throw new ValidationError('Assign a verified academic context before progressing this batch.');
  }
  const { year, semester } = await loadYearSemesterPair(
    departmentId,
    batch.currentAcademicYearId,
    batch.currentSemesterId,
  );
  return { departmentId, batch, year, semester };
}

export async function previewBatchProgression(principal, batchId) {
  const { departmentId, batch, year, semester } = await loadProgressionSource(principal, batchId);
  const current = await describePeriod(year, semester);
  const studentsToAdvance = await StudentAcademicContext.countDocuments({
    departmentId,
    batchId: batch._id,
    status: 'ACTIVE',
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
  });
  if (year.sequence === 4 && semester.sequence === 2) {
    return {
      canProgress: false,
      reason: TERMINAL_PROGRESSION,
      current,
      next: null,
      activeStudentsToAdvance: studentsToAdvance,
    };
  }
  try {
    const next = await resolveNextAcademicPeriod(departmentId, year, semester);
    return {
      canProgress: true,
      reason: '',
      current,
      next: await describePeriod(next.year, next.semester),
      activeStudentsToAdvance: studentsToAdvance,
    };
  } catch (error) {
    if (!(error instanceof ValidationError)) {
      throw error;
    }
    return {
      canProgress: false,
      reason: error.message,
      current,
      next: null,
      activeStudentsToAdvance: studentsToAdvance,
    };
  }
}

export async function progressBatch(principal, batchId, body = {}) {
  if (body.currentAcademicYearId !== undefined || body.currentSemesterId !== undefined) {
    throw new ValidationError(
      'Progression always moves to the next semester in sequence. Do not send a different academic period.',
    );
  }
  const { departmentId, batch, year, semester } = await loadProgressionSource(principal, batchId);
  const next = await resolveNextAcademicPeriod(departmentId, year, semester);
  if (!next) {
    throw new ConflictError(TERMINAL_PROGRESSION);
  }

  const outcome = await runProgressionTransaction(async (session) => {
    const updated = await Batch.findOneAndUpdate(
      {
        _id: batch._id,
        departmentId,
        status: 'ACTIVE',
        currentAcademicYearId: year._id,
        currentSemesterId: semester._id,
      },
      {
        $set: {
          currentAcademicYearId: next.year._id,
          currentSemesterId: next.semester._id,
        },
      },
      { new: true, session },
    );
    if (!updated) {
      throw new ConflictError('This batch was already progressed from that academic period.');
    }

    const contexts = await StudentAcademicContext.find({
      departmentId,
      batchId: batch._id,
      status: 'ACTIVE',
      currentAcademicYearId: year._id,
      currentSemesterId: semester._id,
    }).session(session);

    const recordedAt = new Date();
    const historyOps = contexts.flatMap((context) => [
      {
        updateOne: {
          filter: {
            studentAcademicContextId: context._id,
            academicYearId: year._id,
            semesterId: semester._id,
          },
          update: { $setOnInsert: { userId: context.userId, recordedAt, specialization: context.specialization || null } },
          upsert: true,
        },
      },
      {
        updateOne: {
          filter: {
            studentAcademicContextId: context._id,
            academicYearId: next.year._id,
            semesterId: next.semester._id,
          },
          update: { $setOnInsert: { userId: context.userId, recordedAt, specialization: context.specialization || null } },
          upsert: true,
        },
      },
    ]);
    let historyInserted = 0;
    if (historyOps.length) {
      const written = await StudentAcademicHistory.bulkWrite(historyOps, { session });
      historyInserted = written.upsertedCount || 0;
    }

    const studentUpdate = await StudentAcademicContext.updateMany(
      {
        departmentId,
        batchId: batch._id,
        status: 'ACTIVE',
        currentAcademicYearId: year._id,
        currentSemesterId: semester._id,
      },
      {
        $set: {
          currentAcademicYearId: next.year._id,
          currentSemesterId: next.semester._id,
        },
      },
      { session },
    );

    return {
      batch: updated,
      studentsAdvanced: studentUpdate.modifiedCount || 0,
      historyInserted,
    };
  });

  try {
    await recordAudit({
      actorUserId: principal.userId,
      action: 'academic.batch.progress',
      entityType: 'Batch',
      entityId: outcome.batch._id,
      metadata: {
        fromAcademicYearId: String(year._id),
        fromSemesterId: String(semester._id),
        toAcademicYearId: String(next.year._id),
        toSemesterId: String(next.semester._id),
        studentsAdvanced: outcome.studentsAdvanced,
      },
    });
  } catch (error) {
    progressionLog.error('Batch progression succeeded but audit write failed', {
      batchId: String(outcome.batch._id),
      action: 'academic.batch.progress',
      code: error?.code,
      message: error?.message,
    });
  }

  return {
    ...(await presentBatch(outcome.batch)),
    from: await describePeriod(year, semester),
    to: await describePeriod(next.year, next.semester),
    studentsAdvanced: outcome.studentsAdvanced,
    historyInserted: outcome.historyInserted,
  };
}

export async function listMembers(principal, query) {
  const departmentId = await requireAdminDepartment(principal);
  const role = query.role;
  if (role && ![ROLES.STUDENT, ROLES.LECTURER].includes(role)) {
    throw new ValidationError('Invalid member role');
  }
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { departmentId, ...(role ? { role } : { role: { $in: [ROLES.STUDENT, ROLES.LECTURER] } }) };
  if (query.q) {
    Object.assign(filter, textFilter(query, ['email', 'displayName']));
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ email: 1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  return paginatedResult({ items: items.map(mapMember), total, page, pageSize });
}

export async function setLecturerVerification(principal, userId, body) {
  const departmentId = await requireAdminDepartment(principal);
  requireObjectId(userId, 'lecturer');
  const lecturer = await User.findById(userId);
  if (!lecturer || lecturer.role !== ROLES.LECTURER || String(lecturer.departmentId) !== String(departmentId)) {
    throw new NotFoundError('Lecturer not found');
  }
  if (!LECTURER_STATUSES.includes(body.lecturerStatus)) {
    throw new ValidationError('Invalid lecturer status');
  }
  lecturer.lecturerStatus = body.lecturerStatus;
  await lecturer.save();
  if (body.lecturerStatus !== 'VERIFIED') {
    await LecturerAssignment.updateMany(
      { lecturerUserId: lecturer._id, isActive: true },
      { $set: { isActive: false, revokedAt: new Date() } },
    );
  }
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.lecturer.verify',
    entityType: 'User',
    entityId: lecturer._id,
    metadata: { lecturerStatus: lecturer.lecturerStatus },
  });
  return mapMember(lecturer);
}

export async function listAssignments(principal, query) {
  const departmentId = await requireAdminDepartment(principal);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { departmentId };
  if (query.subjectOfferingId) {
    requireObjectId(query.subjectOfferingId, 'offering');
    filter.subjectOfferingId = query.subjectOfferingId;
  }
  if (query.lecturerUserId) {
    requireObjectId(query.lecturerUserId, 'lecturer');
    filter.lecturerUserId = query.lecturerUserId;
  }
  if (query.active === 'true') {
    filter.isActive = true;
  }
  if (query.active === 'false') {
    filter.isActive = false;
  }
  const [items, total] = await Promise.all([
    LecturerAssignment.find(filter)
      .sort({ assignedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('lecturerUserId', 'email displayName')
      .populate({
        path: 'subjectOfferingId',
        select: 'subjectId batchId',
        populate: [
          { path: 'subjectId', select: 'code name' },
          { path: 'batchId', select: 'code name' },
        ],
      }),
    LecturerAssignment.countDocuments(filter),
  ]);
  return paginatedResult({ items: items.map(mapAssignment), total, page, pageSize });
}

export async function assignLecturer(principal, body) {
  const departmentId = await requireAdminDepartment(principal);
  if (String(body.lecturerUserId) === String(principal.userId)) {
    throw new ForbiddenError('Lecturers cannot be self-assigned');
  }
  requireObjectId(body.lecturerUserId, 'lecturer');
  requireObjectId(body.subjectOfferingId, 'offering');

  const [lecturer, offering] = await Promise.all([
    User.findById(body.lecturerUserId),
    loadScoped(SubjectOffering, body.subjectOfferingId, departmentId, 'Subject offering'),
  ]);

  if (
    !lecturer ||
    lecturer.role !== ROLES.LECTURER ||
    String(lecturer.departmentId) !== String(departmentId)
  ) {
    throw new NotFoundError('Lecturer not found');
  }
  if (lecturer.accountStatus !== 'ACTIVE' || lecturer.lecturerStatus !== 'VERIFIED') {
    throw new ValidationError('Only verified, active lecturers can be assigned');
  }
  assertActive(offering, 'Subject offering');

  const existing = await LecturerAssignment.findOne({
    lecturerUserId: lecturer._id,
    subjectOfferingId: offering._id,
  });
  if (existing) {
    if (existing.isActive) {
      throw new ConflictError('This lecturer is already assigned to the offering');
    }
    existing.isActive = true;
    existing.revokedAt = null;
    existing.assignedByUserId = principal.userId;
    existing.assignedAt = new Date();
    await existing.save();
    await recordAudit({
      actorUserId: principal.userId,
      action: 'academic.assignment.reactivate',
      entityType: 'LecturerAssignment',
      entityId: existing._id,
      metadata: { lecturerUserId: String(lecturer._id), subjectOfferingId: String(offering._id) },
    });
    return mapAssignment(existing);
  }

  const assignment = await LecturerAssignment.create({
    departmentId,
    lecturerUserId: lecturer._id,
    subjectOfferingId: offering._id,
    assignedByUserId: principal.userId,
    assignedAt: new Date(),
    isActive: true,
  });
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.assignment.create',
    entityType: 'LecturerAssignment',
    entityId: assignment._id,
    metadata: { lecturerUserId: String(lecturer._id), subjectOfferingId: String(offering._id) },
  });
  return mapAssignment(assignment);
}

export async function revokeAssignment(principal, assignmentId) {
  const departmentId = await requireAdminDepartment(principal);
  const assignment = await loadScoped(LecturerAssignment, assignmentId, departmentId, 'Assignment');
  assignment.isActive = false;
  assignment.revokedAt = new Date();
  await assignment.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.assignment.revoke',
    entityType: 'LecturerAssignment',
    entityId: assignment._id,
    metadata: { lecturerUserId: String(assignment.lecturerUserId) },
  });
  return mapAssignment(assignment);
}

export async function listStudentContexts(principal, query) {
  const departmentId = await requireAdminDepartment(principal);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { departmentId, ...statusFilter(query.status) };
  if (query.batchId) {
    requireObjectId(query.batchId, 'batch');
    filter.batchId = query.batchId;
  }
  if (query.q) {
    Object.assign(filter, textFilter(query, ['registrationNumber']));
  }
  const [items, total] = await Promise.all([
    StudentAcademicContext.find(filter).sort({ registrationNumber: 1 }).skip(skip).limit(limit),
    StudentAcademicContext.countDocuments(filter),
  ]);
  return paginatedResult({ items: items.map(mapStudentContext), total, page, pageSize });
}

async function assertStudentSpecialization(departmentId, year, value) {
  const empty = value === undefined || value === null || value === '';
  if (year.sequence <= 2) {
    if (!empty) {
      throw new ValidationError('Years 1 and 2 use the common curriculum and cannot take a specialization');
    }
    return null;
  }
  if (empty) {
    return null;
  }
  const specialization = String(value).trim().toUpperCase();
  if (!SPECIALIZATIONS.includes(specialization)) {
    throw new ValidationError('Specialization must be SWT, NST, or empty');
  }
  const mapping = await CurriculumMapping.findOne({
    departmentId,
    academicYearId: year._id,
    specialization,
    status: 'ACTIVE',
  }).select('_id');
  if (!mapping) {
    throw new ValidationError(`This department has no ${specialization} curriculum for this academic year`);
  }
  return specialization;
}

export async function createStudentContext(principal, body) {
  const departmentId = await requireAdminDepartment(principal);
  requireObjectId(body.userId, 'student');
  const student = await User.findById(body.userId);
  if (!student || student.role !== ROLES.STUDENT) {
    throw new NotFoundError('Student not found');
  }
  if (student.departmentId && String(student.departmentId) !== String(departmentId)) {
    throw new ForbiddenError('Forbidden');
  }
  if (!student.departmentId) {
    student.departmentId = departmentId;
    await student.save();
  }

  const [batch, year, semester] = await Promise.all([
    loadScoped(Batch, body.batchId, departmentId, 'Batch'),
    loadScoped(AcademicYear, body.currentAcademicYearId, departmentId, 'Academic year'),
    loadScoped(Semester, body.currentSemesterId, departmentId, 'Semester'),
  ]);
  assertActive(batch, 'Batch');
  assertActive(year, 'Academic year');
  assertActive(semester, 'Semester');
  if (String(semester.academicYearId) !== String(year._id)) {
    throw new ValidationError('Semester does not belong to the selected academic year');
  }

  const registrationNumber = String(body.registrationNumber || '').trim().toUpperCase();
  if (!registrationNumber) {
    throw new ValidationError('Registration number is required');
  }

  const specialization = await assertStudentSpecialization(departmentId, year, body.specialization);
  const context = await StudentAcademicContext.create({
    userId: student._id,
    departmentId,
    batchId: batch._id,
    registrationNumber,
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
    specialization,
    status: 'ACTIVE',
  });
  await StudentAcademicHistory.create({
    studentAcademicContextId: context._id,
    userId: student._id,
    academicYearId: year._id,
    semesterId: semester._id,
    specialization,
    recordedAt: new Date(),
  });
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.student-context.create',
    entityType: 'StudentAcademicContext',
    entityId: context._id,
    metadata: { userId: String(student._id) },
  });
  return mapStudentContext(context);
}

export async function updateStudentContext(principal, contextId, body) {
  const departmentId = await requireAdminDepartment(principal);
  const context = await loadScoped(StudentAcademicContext, contextId, departmentId, 'Student academic context');

  if (body.registrationNumber !== undefined) {
    const next = String(body.registrationNumber).trim().toUpperCase();
    if (next !== context.registrationNumber) {
      throw new ValidationError('Registration number cannot be changed');
    }
  }
  if (body.userId !== undefined && String(body.userId) !== String(context.userId)) {
    throw new ValidationError('Student identity cannot be changed');
  }
  if (body.batchId !== undefined && String(body.batchId) !== String(context.batchId)) {
    throw new ValidationError('Batch cannot be changed on an existing academic context');
  }

  const yearId = body.currentAcademicYearId || context.currentAcademicYearId;
  const semesterId = body.currentSemesterId || context.currentSemesterId;
  const [year, semester] = await Promise.all([
    loadScoped(AcademicYear, yearId, departmentId, 'Academic year'),
    loadScoped(Semester, semesterId, departmentId, 'Semester'),
  ]);
  if (String(semester.academicYearId) !== String(year._id)) {
    throw new ValidationError('Semester does not belong to the selected academic year');
  }
  const nextSpecialization =
    body.specialization !== undefined
      ? await assertStudentSpecialization(departmentId, year, body.specialization)
      : context.specialization || null;
  if (body.specialization === undefined && year.sequence <= 2 && nextSpecialization) {
    throw new ValidationError('Clear specialization before moving this student to Year 1 or Year 2');
  }

  const periodChanged =
    String(year._id) !== String(context.currentAcademicYearId) ||
    String(semester._id) !== String(context.currentSemesterId);
  if (body.currentAcademicYearId || body.currentSemesterId) {
    if (periodChanged) {
      await StudentAcademicHistory.updateOne(
        {
          studentAcademicContextId: context._id,
          academicYearId: context.currentAcademicYearId,
          semesterId: context.currentSemesterId,
        },
        {
          $setOnInsert: {
            userId: context.userId,
            recordedAt: new Date(),
            specialization: context.specialization || null,
          },
        },
        { upsert: true },
      );
      context.currentAcademicYearId = year._id;
      context.currentSemesterId = semester._id;
      await StudentAcademicHistory.updateOne(
        {
          studentAcademicContextId: context._id,
          academicYearId: year._id,
          semesterId: semester._id,
        },
        {
          $setOnInsert: {
            userId: context.userId,
            recordedAt: new Date(),
            specialization: nextSpecialization,
          },
        },
        { upsert: true },
      );
    }
  }
  if (body.specialization !== undefined) {
    context.specialization = nextSpecialization;
    if (!periodChanged) {
      await StudentAcademicHistory.updateOne(
        {
          studentAcademicContextId: context._id,
          academicYearId: context.currentAcademicYearId,
          semesterId: context.currentSemesterId,
        },
        { $set: { specialization: nextSpecialization } },
      );
    }
  }

  if (body.status !== undefined) {
    if (!ENTITY_STATUSES.includes(body.status)) {
      throw new ValidationError('Invalid status');
    }
    context.status = body.status;
  }

  await context.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.student-context.update',
    entityType: 'StudentAcademicContext',
    entityId: context._id,
    metadata: { status: context.status, specialization: context.specialization || null },
  });
  return mapStudentContext(context);
}

export async function deleteStudentContext(principal, contextId) {
  const departmentId = await requireAdminDepartment(principal);
  const context = await loadScoped(StudentAcademicContext, contextId, departmentId, 'Student academic context');
  if (context.status !== 'ARCHIVED') {
    throw new ValidationError('Archive this student academic record before deleting it.');
  }
  const [results, enrollments] = await Promise.all([
    AcademicResult.countDocuments({
      departmentId,
      registrationNumber: context.registrationNumber,
    }),
    SubjectEnrollment.countDocuments({ studentAcademicContextId: context._id }),
  ]);
  if (results > 0 || enrollments > 0) {
    throw new ConflictError(
      'This student record is still referenced by official results or subject enrollments.',
    );
  }
  await StudentAcademicHistory.deleteMany({ studentAcademicContextId: context._id });
  await context.deleteOne();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.student-context.delete',
    entityType: 'StudentAcademicContext',
    entityId: context._id,
    metadata: { registrationNumber: context.registrationNumber },
  });
  return { id: String(context._id), deleted: true };
}

export async function getMyContext(principal) {
  if (principal.role !== ROLES.STUDENT) {
    throw new ForbiddenError('Forbidden');
  }
  const context = await StudentAcademicContext.findOne({ userId: principal.userId });
  if (!context || !canStudentAccessOwnContext(principal, context)) {
    throw new NotFoundError('Academic context not found');
  }
  const history = await StudentAcademicHistory.find({ studentAcademicContextId: context._id }).sort({
    recordedAt: 1,
  });
  const [batch, year, semester, historyYears, historySemesters] = await Promise.all([
    context.batchId ? Batch.findById(context.batchId).select('code name').lean() : null,
    context.currentAcademicYearId
      ? AcademicYear.findById(context.currentAcademicYearId).select('name sequence').lean()
      : null,
    context.currentSemesterId
      ? Semester.findById(context.currentSemesterId).select('name sequence academicYearId').lean()
      : null,
    AcademicYear.find({
      _id: { $in: history.map((row) => row.academicYearId).filter(Boolean) },
    })
      .select('name sequence')
      .lean(),
    Semester.find({
      _id: { $in: history.map((row) => row.semesterId).filter(Boolean) },
    })
      .select('name sequence academicYearId')
      .lean(),
  ]);
  const yearById = new Map(historyYears.map((row) => [String(row._id), row]));
  const semesterById = new Map(historySemesters.map((row) => [String(row._id), row]));
  if (year) {
    yearById.set(String(year._id), year);
  }
  if (semester) {
    semesterById.set(String(semester._id), semester);
  }
  return {
    context: {
      ...mapStudentContext(context),
      batchCode: batch?.code || '',
      batchName: batch?.name || '',
      currentAcademicYearName: year?.name || '',
      currentAcademicYearSequence: year?.sequence ?? null,
      currentSemesterName: semester?.name || '',
      currentSemesterSequence: semester?.sequence ?? null,
    },
    history: history.map((row) => {
      const mapped = mapHistory(row);
      const histYear = yearById.get(String(row.academicYearId));
      const histSemester = semesterById.get(String(row.semesterId));
      return {
        ...mapped,
        academicYearName: histYear?.name || '',
        academicYearSequence: histYear?.sequence ?? null,
        semesterName: histSemester?.name || '',
        semesterSequence: histSemester?.sequence ?? null,
      };
    }),
  };
}

export async function getMyOfferings(principal) {
  if (principal.role === ROLES.LECTURER) {
    const assignments = await LecturerAssignment.find({
      lecturerUserId: principal.userId,
      isActive: true,
    });
    const offeringIds = assignments.map((item) => item.subjectOfferingId);
    const offerings = await SubjectOffering.find({ _id: { $in: offeringIds }, status: 'ACTIVE' }).populate(
      'subjectId',
      'code name',
    );
    return {
      items: offerings.map((offering) => ({
        ...mapOffering(offering),
        subjectCode: offering.subjectId?.code,
        subjectName: offering.subjectId?.name,
        assignmentId: String(
          assignments.find((item) => String(item.subjectOfferingId) === String(offering._id))?._id,
        ),
      })),
    };
  }

  if (principal.role === ROLES.STUDENT) {
    const context = await StudentAcademicContext.findOne({ userId: principal.userId, status: 'ACTIVE' });
    if (!context) {
      return { items: [] };
    }
    const offerings = await SubjectOffering.find({
      departmentId: context.departmentId,
      batchId: context.batchId,
      academicYearId: context.currentAcademicYearId,
      semesterId: context.currentSemesterId,
      status: 'ACTIVE',
    }).populate('subjectId', 'code name');
    const visible = await filterOfferingsForSpecialization(offerings, context.specialization || null);
    return {
      items: visible.map((offering) => ({
        ...mapOffering(offering),
        subjectCode: offering.subjectId?.code,
        subjectName: offering.subjectId?.name,
      })),
    };
  }

  throw new ForbiddenError('Forbidden');
}

export async function getStudentContextForAdmin(principal, contextId) {
  const departmentId = await requireAdminDepartment(principal);
  const context = await loadScoped(StudentAcademicContext, contextId, departmentId, 'Student academic context');
  const history = await StudentAcademicHistory.find({ studentAcademicContextId: context._id }).sort({
    recordedAt: 1,
  });
  return { context: mapStudentContext(context), history: history.map(mapHistory) };
}

export async function reconcileAcademicFoundation(principal) {
  const departmentId = await requireAdminDepartment(principal);
  const issues = [];
  const contexts = await StudentAcademicContext.find({ departmentId })
    .select('userId currentAcademicYearId currentSemesterId')
    .lean();
  const contextUserIds = contexts.map((row) => row.userId);
  const studentsWithoutContext = await User.find({
    departmentId,
    role: ROLES.STUDENT,
    _id: { $nin: contextUserIds },
  })
    .select('_id')
    .lean();
  for (const student of studentsWithoutContext) {
    issues.push({
      issue: 'STUDENT_WITHOUT_ACADEMIC_CONTEXT',
      entity: 'User',
      entityId: String(student._id),
      recommendedAction: 'This student account has no academic membership. This report does not create one.',
    });
  }
  const linkedUsers = await User.find({ _id: { $in: contextUserIds } })
    .select('role')
    .lean();
  const studentsById = new Map(
    linkedUsers.filter((user) => user.role === ROLES.STUDENT).map((user) => [String(user._id), user]),
  );
  for (const context of contexts) {
    if (!studentsById.has(String(context.userId))) {
      issues.push({
        issue: 'ACADEMIC_CONTEXT_WITHOUT_STUDENT',
        entity: 'StudentAcademicContext',
        entityId: String(context._id),
        recommendedAction: 'This academic membership does not point at a student account. This report does not delete it.',
      });
    }
  }
  const assignments = await LecturerAssignment.find({ departmentId, isActive: true })
    .select('lecturerUserId')
    .lean();
  const lecturers = await User.find({ _id: { $in: assignments.map((row) => row.lecturerUserId) } })
    .select('accountStatus lecturerStatus')
    .lean();
  const lecturersById = new Map(lecturers.map((user) => [String(user._id), user]));
  for (const assignment of assignments) {
    const lecturer = lecturersById.get(String(assignment.lecturerUserId));
    if (!lecturer || lecturer.accountStatus !== 'ACTIVE' || lecturer.lecturerStatus !== 'VERIFIED') {
      issues.push({
        issue: 'ACTIVE_ASSIGNMENT_FOR_INELIGIBLE_LECTURER',
        entity: 'LecturerAssignment',
        entityId: String(assignment._id),
        recommendedAction: 'This active assignment is not held by an active verified lecturer. This report does not revoke it.',
      });
    }
  }
  const offerings = await SubjectOffering.find({ departmentId })
    .select('academicYearId semesterId')
    .lean();
  const semesterIds = [
    ...contexts.map((row) => row.currentSemesterId),
    ...offerings.map((row) => row.semesterId),
  ];
  const semesters = await Semester.find({ _id: { $in: semesterIds } })
    .select('academicYearId')
    .lean();
  const semestersById = new Map(semesters.map((semester) => [String(semester._id), semester]));
  for (const context of contexts) {
    const semester = semestersById.get(String(context.currentSemesterId));
    if (semester && String(semester.academicYearId) !== String(context.currentAcademicYearId)) {
      issues.push({
        issue: 'STUDENT_SEMESTER_YEAR_MISMATCH',
        entity: 'StudentAcademicContext',
        entityId: String(context._id),
        recommendedAction: 'This student semester does not belong to the recorded academic year. This report does not move the student.',
      });
    }
  }
  for (const offering of offerings) {
    const semester = semestersById.get(String(offering.semesterId));
    if (semester && String(semester.academicYearId) !== String(offering.academicYearId)) {
      issues.push({
        issue: 'OFFERING_SEMESTER_YEAR_MISMATCH',
        entity: 'SubjectOffering',
        entityId: String(offering._id),
        recommendedAction: 'This offering semester does not belong to the recorded academic year. This report does not change the offering.',
      });
    }
  }
  return {
    issues,
    issueCount: issues.length,
    note: 'This check reports identity and academic-structure drift. It does not create, move, or revoke records.',
  };
}
