function id(value) {
  if (!value) {
    return null;
  }
  return String(value._id || value);
}

export function mapDepartment(doc) {
  return {
    id: id(doc),
    code: doc.code,
    name: doc.name,
    description: doc.description || '',
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function mapBatch(doc) {
  return {
    id: id(doc),
    departmentId: id(doc.departmentId),
    code: doc.code,
    name: doc.name,
    status: doc.status,
    currentAcademicYearId: id(doc.currentAcademicYearId),
    currentSemesterId: id(doc.currentSemesterId),
    academicContextVerifiedAt: doc.academicContextVerifiedAt || null,
    specialization: doc.specialization || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function mapAcademicYear(doc) {
  return {
    id: id(doc),
    departmentId: id(doc.departmentId),
    sequence: doc.sequence,
    name: doc.name,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function mapSemester(doc) {
  return {
    id: id(doc),
    departmentId: id(doc.departmentId),
    academicYearId: id(doc.academicYearId),
    sequence: doc.sequence,
    name: doc.name,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function mapSubject(doc) {
  return {
    id: id(doc),
    departmentId: id(doc.departmentId),
    code: doc.code,
    name: doc.name,
    credits: doc.credits,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function mapCurriculum(doc) {
  const subject = doc.subjectId;
  const subjectId = subject && subject.code ? String(subject._id) : id(doc.subjectId);
  return {
    id: id(doc),
    departmentId: id(doc.departmentId),
    subjectId,
    subjectCode: subject && subject.code ? subject.code : undefined,
    subjectName: subject && subject.name ? subject.name : undefined,
    academicYearId: id(doc.academicYearId),
    semesterId: id(doc.semesterId),
    specialization: doc.specialization || null,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function mapOffering(doc) {
  const subject = doc.subjectId;
  const subjectId = subject && subject.code ? String(subject._id) : id(doc.subjectId);
  return {
    id: id(doc),
    departmentId: id(doc.departmentId),
    subjectId,
    subjectCode: subject && subject.code ? subject.code : undefined,
    subjectName: subject && subject.name ? subject.name : undefined,
    batchId: id(doc.batchId),
    academicYearId: id(doc.academicYearId),
    semesterId: id(doc.semesterId),
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function mapAssignment(doc) {
  return {
    id: id(doc),
    departmentId: id(doc.departmentId),
    lecturerUserId: id(doc.lecturerUserId),
    subjectOfferingId: id(doc.subjectOfferingId),
    assignedByUserId: id(doc.assignedByUserId),
    assignedAt: doc.assignedAt,
    revokedAt: doc.revokedAt || null,
    isActive: doc.isActive !== false,
  };
}

export function mapStudentContext(doc) {
  return {
    id: id(doc),
    userId: id(doc.userId),
    departmentId: id(doc.departmentId),
    batchId: id(doc.batchId),
    registrationNumber: doc.registrationNumber,
    currentAcademicYearId: id(doc.currentAcademicYearId),
    currentSemesterId: id(doc.currentSemesterId),
    specialization: doc.specialization || null,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function mapHistory(doc) {
  return {
    id: id(doc),
    studentAcademicContextId: id(doc.studentAcademicContextId),
    userId: id(doc.userId),
    academicYearId: id(doc.academicYearId),
    semesterId: id(doc.semesterId),
    specialization: doc.specialization || null,
    recordedAt: doc.recordedAt,
  };
}

export function mapEnrollment(doc) {
  return {
    id: id(doc),
    departmentId: id(doc.departmentId),
    batchId: id(doc.batchId),
    studentUserId: id(doc.studentUserId),
    studentAcademicContextId: id(doc.studentAcademicContextId),
    registrationNumber: doc.registrationNumber,
    subjectId: id(doc.subjectId),
    subjectCode: doc.subjectCode,
    subjectOfferingId: id(doc.subjectOfferingId),
    enrollmentType: doc.enrollmentType,
    status: doc.status,
    academicResultId: id(doc.academicResultId),
    originalAcademicYearId: id(doc.originalAcademicYearId),
    originalSemesterId: id(doc.originalSemesterId),
    createdByUserId: id(doc.createdByUserId),
    cancelledAt: doc.cancelledAt || null,
    cancelledByUserId: id(doc.cancelledByUserId),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function mapMember(user) {
  return {
    id: id(user),
    email: user.email,
    displayName: user.displayName || '',
    role: user.role,
    accountStatus: user.accountStatus,
    lecturerStatus: user.lecturerStatus,
    departmentId: user.departmentId ? id(user.departmentId) : null,
  };
}
