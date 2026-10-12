import { ENROLLMENT_STATUSES, ENROLLMENT_TYPES } from '../constants.js';
import { Subject } from '../models/subject.model.js';
import { SubjectOffering } from '../models/subject-offering.model.js';
import { StudentAcademicContext } from '../models/student-academic-context.model.js';
import { SubjectEnrollment } from '../models/subject-enrollment.model.js';
import { User } from '../../authentication/models/user.model.js';
import { AcademicResult } from '../../results/index.js';
import { recordAudit as persistAudit } from '../../audit-security/services/record-audit.service.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { assertDepartmentAdmin } from '../policies/academic.policies.js';
import { parsePagination, paginatedResult } from '../utils/pagination.js';
import { requireObjectId } from '../utils/ids.js';
import { mapEnrollment } from '../mappers/academic.mappers.js';

const DUPLICATE_ENROLLMENT = 'This student is already enrolled in the subject offering';

async function recordAudit({ actorUserId, action, entityType, entityId, metadata }) {
  await persistAudit({
    actorUserId,
    action,
    entityType,
    entityId,
    metadata,
  });
}

function duplicateKey(error) {
  return error?.code === 11000;
}

async function requireAdminDepartment(principal) {
  assertDepartmentAdmin(principal);
  if (!principal.departmentId) {
    throw new ValidationError('Department is not configured for this administrator');
  }
  return principal.departmentId;
}

async function loadScoped(Model, id, departmentId, label) {
  requireObjectId(id, label);
  const doc = await Model.findById(id);
  if (!doc || String(doc.departmentId) !== String(departmentId)) {
    throw new NotFoundError(`${label} not found`);
  }
  return doc;
}

function assertActive(entity, label) {
  if (!entity || entity.status !== 'ACTIVE') {
    throw new ValidationError(`${label} is not active`);
  }
}

function assertAgrees(body, field, actual, message) {
  if (body[field] === undefined || body[field] === null || body[field] === '') {
    return;
  }
  if (String(body[field]) !== String(actual)) {
    throw new ValidationError(message);
  }
}

function enrollmentStatusFilter(queryStatus) {
  if (!queryStatus || queryStatus === 'ALL') {
    return {};
  }
  if (!ENROLLMENT_STATUSES.includes(queryStatus)) {
    throw new ValidationError('Invalid status');
  }
  return { status: queryStatus };
}

async function linkedResult({ departmentId, context, offering, academicResultId }) {
  if (!academicResultId) {
    return null;
  }
  const result = await loadScoped(AcademicResult, academicResultId, departmentId, 'Academic result');
  if (String(result.studentUserId) !== String(context.userId)) {
    throw new ValidationError('Academic result does not belong to this student');
  }
  if (String(result.subjectId) !== String(offering.subjectId)) {
    throw new ValidationError('Academic result subject does not match the offering');
  }
  return result;
}

export async function createOfferingEnrollment(principal, offeringId, body = {}) {
  const departmentId = await requireAdminDepartment(principal);
  const offering = await loadScoped(SubjectOffering, offeringId, departmentId, 'Subject offering');
  assertActive(offering, 'Subject offering');

  if (!body.studentContextId) {
    throw new ValidationError('Student context is required');
  }
  if (!ENROLLMENT_TYPES.includes(body.enrollmentType)) {
    throw new ValidationError('Enrollment type must be REPEAT or ARREAR');
  }

  const context = await loadScoped(
    StudentAcademicContext,
    body.studentContextId,
    departmentId,
    'Student academic context',
  );
  assertActive(context, 'Student academic context');
  if (String(context.batchId) !== String(offering.batchId)) {
    throw new ValidationError('Student batch does not match the subject offering');
  }

  const [student, subject] = await Promise.all([
    User.findById(context.userId),
    loadScoped(Subject, offering.subjectId, departmentId, 'Subject'),
  ]);
  if (!student || student.role !== ROLES.STUDENT || String(student.departmentId) !== String(departmentId)) {
    throw new NotFoundError('Student not found');
  }
  assertActive(subject, 'Subject');

  assertAgrees(body, 'studentUserId', context.userId, 'Student does not match the academic context');
  assertAgrees(body, 'registrationNumber', context.registrationNumber, 'Registration number does not match the student');
  assertAgrees(body, 'departmentId', departmentId, 'Department does not match the offering');
  assertAgrees(body, 'batchId', offering.batchId, 'Batch does not match the offering');
  assertAgrees(body, 'subjectId', offering.subjectId, 'Subject does not match the offering');
  assertAgrees(
    body,
    'subjectCode',
    subject.code,
    'Subject code does not match the offering',
  );

  const result = await linkedResult({
    departmentId,
    context,
    offering,
    academicResultId: body.academicResultId,
  });
  if (result) {
    assertAgrees(
      body,
      'originalAcademicYearId',
      result.studentAcademicYearId,
      'Original academic year does not match the linked result',
    );
    assertAgrees(
      body,
      'originalSemesterId',
      result.studentSemesterId,
      'Original semester does not match the linked result',
    );
  } else if (body.originalAcademicYearId || body.originalSemesterId) {
    throw new ValidationError('Original academic period is taken from a linked official result');
  }

  const active = await SubjectEnrollment.findOne({
    studentUserId: context.userId,
    subjectOfferingId: offering._id,
    status: 'ACTIVE',
  });
  if (active) {
    throw new ConflictError(DUPLICATE_ENROLLMENT);
  }

  let enrollment;
  try {
    enrollment = await SubjectEnrollment.create({
      departmentId,
      batchId: offering.batchId,
      studentUserId: context.userId,
      studentAcademicContextId: context._id,
      registrationNumber: context.registrationNumber,
      subjectId: subject._id,
      subjectCode: subject.code,
      subjectOfferingId: offering._id,
      enrollmentType: body.enrollmentType,
      status: 'ACTIVE',
      academicResultId: result?._id,
      originalAcademicYearId: result?.studentAcademicYearId,
      originalSemesterId: result?.studentSemesterId,
      createdByUserId: principal.userId,
    });
  } catch (error) {
    if (duplicateKey(error)) {
      throw new ConflictError(DUPLICATE_ENROLLMENT);
    }
    throw error;
  }

  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.enrollment.create',
    entityType: 'SubjectEnrollment',
    entityId: enrollment._id,
    metadata: {
      subjectOfferingId: String(offering._id),
      studentUserId: String(context.userId),
      enrollmentType: enrollment.enrollmentType,
    },
  });
  return mapEnrollment(enrollment);
}

export async function listOfferingEnrollments(principal, offeringId, query = {}) {
  const departmentId = await requireAdminDepartment(principal);
  await loadScoped(SubjectOffering, offeringId, departmentId, 'Subject offering');
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = {
    departmentId,
    subjectOfferingId: offeringId,
    ...enrollmentStatusFilter(query.status),
  };
  const [items, total] = await Promise.all([
    SubjectEnrollment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    SubjectEnrollment.countDocuments(filter),
  ]);
  return paginatedResult({ items: items.map(mapEnrollment), total, page, pageSize });
}

export async function listStudentEnrollments(principal, contextId, query = {}) {
  const departmentId = await requireAdminDepartment(principal);
  const context = await loadScoped(StudentAcademicContext, contextId, departmentId, 'Student academic context');
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = {
    departmentId,
    studentUserId: context.userId,
    ...enrollmentStatusFilter(query.status),
  };
  const [items, total] = await Promise.all([
    SubjectEnrollment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    SubjectEnrollment.countDocuments(filter),
  ]);
  return paginatedResult({ items: items.map(mapEnrollment), total, page, pageSize });
}

export async function cancelEnrollment(principal, enrollmentId, body = {}) {
  const departmentId = await requireAdminDepartment(principal);
  const enrollment = await loadScoped(SubjectEnrollment, enrollmentId, departmentId, 'Enrollment');
  if (body.status !== 'CANCELLED') {
    throw new ValidationError('Enrollment can only be cancelled');
  }
  if (enrollment.status === 'CANCELLED') {
    throw new ConflictError('Enrollment is already cancelled');
  }
  enrollment.status = 'CANCELLED';
  enrollment.cancelledAt = new Date();
  enrollment.cancelledByUserId = principal.userId;
  await enrollment.save();
  await recordAudit({
    actorUserId: principal.userId,
    action: 'academic.enrollment.cancel',
    entityType: 'SubjectEnrollment',
    entityId: enrollment._id,
    metadata: {
      subjectOfferingId: String(enrollment.subjectOfferingId),
      studentUserId: String(enrollment.studentUserId),
    },
  });
  return mapEnrollment(enrollment);
}
