import { ENTITY_STATUSES, LECTURER_STATUSES, ACADEMIC_YEAR_SEQUENCE, SEMESTER_SEQUENCE } from '../constants.js';
import { Department } from '../models/department.model.js';
import { Batch } from '../models/batch.model.js';
import { AcademicYear } from '../models/academic-year.model.js';
import { Semester } from '../models/semester.model.js';
import { Subject } from '../models/subject.model.js';
import { SubjectOffering } from '../models/subject-offering.model.js';
import { LecturerAssignment } from '../models/lecturer-assignment.model.js';
import { StudentAcademicContext } from '../models/student-academic-context.model.js';
import { StudentAcademicHistory } from '../models/student-academic-history.model.js';
import { User } from '../../authentication/models/user.model.js';
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
import { parsePagination, paginatedResult, escapeRegex } from '../utils/pagination.js';
import { requireObjectId } from '../utils/ids.js';
import {
  mapAcademicYear,
  mapAssignment,
  mapBatch,
  mapDepartment,
  mapHistory,
  mapMember,
  mapOffering,
  mapSemester,
  mapStudentContext,
  mapSubject,
} from '../mappers/academic.mappers.js';

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

export async function createBatch(principal, body) {
  const departmentId = await requireAdminDepartment(principal);
  const department = await Department.findById(departmentId);
  assertActive(department, 'Department');
  const code = String(body.code || '').trim();
  const name = String(body.name || '').trim();
  if (!code || !name) {
    throw new ValidationError('Batch code and name are required');
  }
  const batch = await Batch.create({ departmentId, code, name, status: 'ACTIVE' });
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
  await batch.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.batch.update',
    entityType: 'Batch',
    entityId: batch._id,
    metadata: { status: batch.status },
  });
  return mapBatch(batch);
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
  const year = await AcademicYear.create({ departmentId, sequence, name, status: 'ACTIVE' });
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

export async function listOfferings(principal, query) {
  const departmentId = await requireAdminDepartment(principal);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { departmentId, ...statusFilter(query.status) };
  for (const field of ['subjectId', 'batchId', 'academicYearId', 'semesterId']) {
    if (query[field]) {
      requireObjectId(query[field], field);
      filter[field] = query[field];
    }
  }
  const [items, total] = await Promise.all([
    SubjectOffering.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('subjectId', 'code name'),
    SubjectOffering.countDocuments(filter),
  ]);
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
    LecturerAssignment.find(filter).sort({ assignedAt: -1 }).skip(skip).limit(limit),
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

  const context = await StudentAcademicContext.create({
    userId: student._id,
    departmentId,
    batchId: batch._id,
    registrationNumber,
    currentAcademicYearId: year._id,
    currentSemesterId: semester._id,
    status: 'ACTIVE',
  });
  await StudentAcademicHistory.create({
    studentAcademicContextId: context._id,
    userId: student._id,
    academicYearId: year._id,
    semesterId: semester._id,
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

  if (body.currentAcademicYearId || body.currentSemesterId) {
    const yearId = body.currentAcademicYearId || context.currentAcademicYearId;
    const semesterId = body.currentSemesterId || context.currentSemesterId;
    const [year, semester] = await Promise.all([
      loadScoped(AcademicYear, yearId, departmentId, 'Academic year'),
      loadScoped(Semester, semesterId, departmentId, 'Semester'),
    ]);
    if (String(semester.academicYearId) !== String(year._id)) {
      throw new ValidationError('Semester does not belong to the selected academic year');
    }
    const changed =
      String(year._id) !== String(context.currentAcademicYearId) ||
      String(semester._id) !== String(context.currentSemesterId);
    if (changed) {
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
          },
        },
        { upsert: true },
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
    metadata: { status: context.status },
  });
  return mapStudentContext(context);
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
  return { context: mapStudentContext(context), history: history.map(mapHistory) };
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
    return {
      items: offerings.map((offering) => ({
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
    .limit(200)
    .lean();
  const contextUserIds = contexts.map((row) => row.userId);
  const studentsWithoutContext = await User.find({
    departmentId,
    role: ROLES.STUDENT,
    _id: { $nin: contextUserIds },
  })
    .select('_id')
    .limit(200)
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
    .limit(200)
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
    .limit(200)
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
