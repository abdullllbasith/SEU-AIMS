import { User } from '../../authentication/index.js';
import {
  Department,
  Batch,
  AcademicYear,
  Semester,
  findStudentContextByUserId,
} from '../../academic-foundation/index.js';
import { storeProfileImage, loadAuthorizedProfileImage } from '../../files/index.js';
import { recordAudit as persistAudit } from '../../audit-security/services/record-audit.service.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { PROFILE_DISPLAY_NAME_MAX, PROFILE_FORBIDDEN_FIELDS } from '../constants.js';
import { normalizePhone } from '../utils/phone.js';

function id(value) {
  return value ? String(value) : null;
}

export async function mapProfile(user) {
  const context = user.role === 'STUDENT' ? await findStudentContextByUserId(user._id) : null;
  const department = user.departmentId ? await Department.findById(user.departmentId).select('code name') : null;
  const batch = context?.batchId ? await Batch.findById(context.batchId).select('code name') : null;
  const year = context?.currentAcademicYearId
    ? await AcademicYear.findById(context.currentAcademicYearId).select('sequence name')
    : null;
  const semester = context?.currentSemesterId
    ? await Semester.findById(context.currentSemesterId).select('sequence name')
    : null;
  return {
    id: String(user._id),
    role: user.role,
    email: user.email,
    displayName: user.displayName || '',
    phone: user.phone || '',
    whatsappNumber: user.whatsappNumber || '',
    hasProfileImage: Boolean(user.profileImageFileId),
    profileRevision: user.profileRevision || 0,
    department: department
      ? { id: String(department._id), code: department.code, name: department.name }
      : null,
    academicIdentity: context
      ? {
          registrationNumber: context.registrationNumber,
          batch: batch ? { id: String(batch._id), code: batch.code, name: batch.name } : null,
          academicYear: year ? { id: String(year._id), sequence: year.sequence, name: year.name } : null,
          semester: semester ? { id: String(semester._id), sequence: semester.sequence, name: semester.name } : null,
        }
      : null,
    editableFields: ['displayName', 'phone', 'whatsappNumber', 'profileImage'],
  };
}

export async function getOwnProfile(principal) {
  const user = await User.findById(principal.userId);
  if (!user) {
    throw new NotFoundError('Profile not found');
  }
  return mapProfile(user);
}

export async function updateOwnProfile(principal, body = {}) {
  const user = await User.findById(principal.userId);
  if (!user) {
    throw new NotFoundError('Profile not found');
  }
  for (const field of PROFILE_FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      throw new ForbiddenError('That field cannot be changed from your profile');
    }
  }
  if (body.studentId && String(body.studentId) !== String(principal.userId)) {
    throw new ForbiddenError('Forbidden');
  }
  if (body.userId && String(body.userId) !== String(principal.userId)) {
    throw new ForbiddenError('Forbidden');
  }
  if (body.expectedRevision !== undefined && Number(body.expectedRevision) !== Number(user.profileRevision || 0)) {
    throw new ConflictError('Profile was updated elsewhere. Reload and try again.');
  }
  if (body.displayName !== undefined) {
    const displayName = String(body.displayName).trim();
    if (!displayName || displayName.length > PROFILE_DISPLAY_NAME_MAX) {
      throw new ValidationError('Display name is required and must be 80 characters or fewer');
    }
    user.displayName = displayName;
  }
  if (body.phone !== undefined) {
    user.phone = normalizePhone(body.phone);
    if (body.whatsappNumber === undefined) {
      user.whatsappNumber = user.phone;
    }
  }
  if (body.whatsappNumber !== undefined) {
    user.whatsappNumber = normalizePhone(body.whatsappNumber);
  }
  user.profileRevision = Number(user.profileRevision || 0) + 1;
  await user.save();
  await persistAudit({
    actorUserId: principal.userId,
    action: 'profile.update',
    entityType: 'User',
    entityId: String(user._id),
    metadata: { profileRevision: user.profileRevision },
    occurredAt: new Date(),
  });
  return mapProfile(user);
}

export async function uploadOwnProfileImage(principal, file, infrastructure) {
  const user = await User.findById(principal.userId);
  if (!user) {
    throw new NotFoundError('Profile not found');
  }
  const stored = await storeProfileImage({
    buffer: file?.buffer,
    originalname: file?.originalname,
    principal,
    infrastructure,
  });
  if (stored.scanStatus !== 'SAFE' || stored.availability !== 'AVAILABLE') {
    throw new ValidationError('Profile image is not available until it has passed security scanning');
  }
  user.profileImageFileId = stored._id;
  user.profileRevision = Number(user.profileRevision || 0) + 1;
  await user.save();
  await persistAudit({
    actorUserId: principal.userId,
    action: 'profile.photo.update',
    entityType: 'StoredFile',
    entityId: String(stored._id),
    metadata: { profileRevision: user.profileRevision },
    occurredAt: new Date(),
  });
  return mapProfile(user);
}

export async function downloadOwnProfileImage(principal, infrastructure) {
  const user = await User.findById(principal.userId);
  if (!user?.profileImageFileId) {
    throw new NotFoundError('Profile image not found');
  }
  return loadAuthorizedProfileImage({
    principal,
    fileId: user.profileImageFileId,
    infrastructure,
  });
}

export function assertSameDepartment(principal, departmentId) {
  if (departmentId && principal.departmentId && String(departmentId) !== String(principal.departmentId)) {
    throw new ForbiddenError('Forbidden');
  }
}

export { id };
