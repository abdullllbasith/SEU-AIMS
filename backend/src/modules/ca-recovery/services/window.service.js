import { CaApplicationWindow } from '../models/ca-application-window.model.js';
import { IncompleteCa } from '../models/incomplete-ca.model.js';
import { findStudentContextByUserId, Semester } from '../../academic-foundation/index.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { requireObjectId, parsePagination, windowLifecycle } from '../utils/http.js';
import { emitCaNotification, recordCaAudit } from './notify.js';

function assertAdmin(principal) {
  if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR || !principal.departmentId) {
    throw new ForbiddenError('Forbidden');
  }
}

function mapWindow(doc, now = new Date()) {
  return {
    id: String(doc._id),
    departmentId: String(doc.departmentId),
    academicYearId: String(doc.academicYearId),
    semesterId: String(doc.semesterId),
    opensAt: doc.opensAt,
    closesAt: doc.closesAt,
    published: doc.published,
    suspended: doc.suspended,
    lifecycle: windowLifecycle(doc, now),
  };
}

export async function createOrUpdateWindow(principal, body, { infrastructure } = {}) {
  assertAdmin(principal);
  requireObjectId(body.academicYearId, 'academic year');
  requireObjectId(body.semesterId, 'semester');
  const semester = await Semester.findById(body.semesterId);
  if (!semester || String(semester.departmentId) !== String(principal.departmentId)) {
    throw new NotFoundError('Semester not found');
  }
  if (String(semester.academicYearId) !== String(body.academicYearId)) {
    throw new ValidationError('Semester does not belong to the academic year');
  }
  const opensAt = new Date(body.opensAt);
  const closesAt = new Date(body.closesAt);
  if (Number.isNaN(opensAt.getTime()) || Number.isNaN(closesAt.getTime()) || closesAt <= opensAt) {
    throw new ValidationError('Window must have a valid opening and later closing time');
  }

  try {
    const doc = await CaApplicationWindow.findOneAndUpdate(
      {
        departmentId: principal.departmentId,
        academicYearId: body.academicYearId,
        semesterId: body.semesterId,
      },
      {
        departmentId: principal.departmentId,
        academicYearId: body.academicYearId,
        semesterId: body.semesterId,
        opensAt,
        closesAt,
        published: Boolean(body.published),
        suspended: Boolean(body.suspended),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await recordCaAudit({
      actorUserId: principal.userId,
      action: 'ca.window.save',
      entityType: 'CaApplicationWindow',
      entityId: doc._id,
      metadata: { lifecycle: windowLifecycle(doc) },
    });
    if (windowLifecycle(doc) === 'OPEN') {
      const students = await IncompleteCa.find({
        academicYearId: doc.academicYearId,
        semesterId: doc.semesterId,
        status: 'OPEN',
      }).distinct('studentUserId');
      for (const studentUserId of students) {
        await emitCaNotification({
          recipientUserId: studentUserId,
          type: 'CA_WINDOW_OPEN',
          sourceId: String(doc._id),
          departmentId: principal.departmentId,
          infrastructure,
        });
      }
    }
    return mapWindow(doc);
  } catch (error) {
    if (error?.code === 11000) {
      throw new ConflictError('An application window already exists for this semester');
    }
    throw error;
  }
}

export async function listWindows(principal, query = {}) {
  assertAdmin(principal);
  const { skip, limit, page, pageSize } = parsePagination(query);
  const filter = { departmentId: principal.departmentId };
  const [items, total] = await Promise.all([
    CaApplicationWindow.find(filter).sort({ opensAt: -1 }).skip(skip).limit(limit),
    CaApplicationWindow.countDocuments(filter),
  ]);
  return { items: items.map((item) => mapWindow(item)), total, page, pageSize };
}

export async function getOpenWindowForStudent(principal, query = {}) {
  if (principal.role !== ROLES.STUDENT) {
    throw new ForbiddenError('Forbidden');
  }
  const context = await findStudentContextByUserId(principal.userId);
  if (!context) {
    return { window: null, lifecycle: 'UNPUBLISHED' };
  }
  const academicYearId = query.academicYearId || context.currentAcademicYearId;
  const semesterId = query.semesterId || context.currentSemesterId;
  const doc = await CaApplicationWindow.findOne({
    departmentId: context.departmentId,
    academicYearId,
    semesterId,
  });
  return { window: doc ? mapWindow(doc) : null, lifecycle: windowLifecycle(doc) };
}

export { mapWindow, windowLifecycle };
