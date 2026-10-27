import { AcademicYear, Semester, Subject, findStudentContextByUserId } from '../../academic-foundation/index.js';
import { User } from '../../authentication/models/user.model.js';
import { IncompleteCa } from '../models/incomplete-ca.model.js';
import { CaApplicationSubject } from '../models/ca-application-subject.model.js';

const TITLES = new Set(['', 'Mr.', 'Ms.']);
const SEMESTERS = new Set(['', 'I', 'II']);
const YEARS = new Set(['', '1', '2', '3', '4']);

const SPECIALIZATION_LABELS = {
  SWT: 'Software Technologies',
  NST: 'Network & Security Technologies',
};

function clip(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function caps(value, max) {
  return clip(value, max).toUpperCase();
}

function examYearKey(year) {
  const sequence = Number(year?.sequence);
  return sequence >= 1 && sequence <= 4 ? String(sequence) : '';
}

function examSemesterKey(semester) {
  const sequence = Number(semester?.sequence);
  if (sequence === 1) return 'I';
  if (sequence === 2) return 'II';
  return '';
}

export function hasSavedExamForm(form) {
  return Boolean(form && (form.name || (Array.isArray(form.subjects) && form.subjects.length)));
}

export function serializeExamForm(form) {
  const source = form || {};
  return {
    title: source.title || '',
    name: caps(source.name, 120),
    registrationNumber: caps(source.registrationNumber, 40),
    currentYear: caps(source.currentYear, 40),
    currentSemester: caps(source.currentSemester, 40),
    examinationSemester: source.examinationSemester || '',
    examinationYear: source.examinationYear || '',
    specialization: caps(source.specialization, 80),
    address: caps(source.address, 300),
    mobile: source.mobile || '',
    subjects: (source.subjects || []).map((row) => ({
      code: caps(row.code, 20),
      credits: row.credits || '',
      title: caps(row.title, 120),
    })),
    signedOn: source.signedOn || '',
    faculty: 'FT',
  };
}

export function normalizeExamForm(input, fallback = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const pick = (key, max) =>
    Object.prototype.hasOwnProperty.call(source, key) ? clip(source[key], max) : clip(fallback[key], max);
  const title = TITLES.has(source.title) ? source.title : TITLES.has(fallback.title) ? fallback.title : '';
  const examinationSemester = SEMESTERS.has(source.examinationSemester)
    ? source.examinationSemester
    : SEMESTERS.has(fallback.examinationSemester)
      ? fallback.examinationSemester
      : '';
  const examinationYear = Object.prototype.hasOwnProperty.call(source, 'examinationYear') &&
    YEARS.has(String(source.examinationYear ?? ''))
    ? String(source.examinationYear ?? '')
    : YEARS.has(String(fallback.examinationYear || ''))
      ? String(fallback.examinationYear || '')
      : '';
  const rawRows = Array.isArray(source.subjects) ? source.subjects : fallback.subjects || [];
  const subjects = rawRows
    .slice(0, 8)
    .map((row) => ({
      code: clip(row?.code, 20).toUpperCase(),
      credits: clip(row?.credits, 8),
      title: clip(row?.title, 120).toUpperCase(),
    }))
    .filter((row) => row.code || row.title);
  return {
    title,
    name: pick('name', 120).toUpperCase(),
    registrationNumber: pick('registrationNumber', 40).toUpperCase(),
    currentYear: pick('currentYear', 40).toUpperCase(),
    currentSemester: pick('currentSemester', 40).toUpperCase(),
    examinationSemester,
    examinationYear,
    specialization: pick('specialization', 80).toUpperCase(),
    address: pick('address', 300).toUpperCase(),
    mobile: pick('mobile', 20),
    subjects,
    signedOn: pick('signedOn', 20),
  };
}

export async function composeExamForm({ userId, context, examYearId, examSemesterId, subjectRefs }) {
  const [user, currentYear, currentSemester, examYear, examSemester, subjects] = await Promise.all([
    User.findById(userId),
    AcademicYear.findById(context.currentAcademicYearId),
    Semester.findById(context.currentSemesterId),
    AcademicYear.findById(examYearId),
    Semester.findById(examSemesterId),
    Subject.find({ _id: { $in: subjectRefs.map((item) => item.subjectId) } }),
  ]);
  const byId = new Map(subjects.map((item) => [String(item._id), item]));
  return {
    title: '',
    name: caps(user?.displayName, 120),
    registrationNumber: caps(context.registrationNumber, 40),
    currentYear: caps(currentYear?.name, 40),
    currentSemester: caps(currentSemester?.name, 40),
    examinationSemester: examSemesterKey(examSemester),
    examinationYear: examYearKey(examYear),
    specialization: caps(SPECIALIZATION_LABELS[context.specialization], 80),
    address: '',
    mobile: user?.phone || user?.whatsappNumber || '',
    subjects: subjectRefs.slice(0, 8).map((item) => {
      const subject = byId.get(String(item.subjectId));
      return {
        code: caps(subject?.code || item.subjectCode, 20),
        credits: subject ? String(subject.credits) : '',
        title: caps(subject?.name, 120),
      };
    }),
    signedOn: new Date().toISOString().slice(0, 10),
  };
}

export async function composeExamFormForApplication(application) {
  const context = await findStudentContextByUserId(application.studentUserId);
  if (!context) {
    return serializeExamForm(application.form);
  }
  const links = await CaApplicationSubject.find({ applicationId: application._id });
  const conditions = await IncompleteCa.find({ _id: { $in: links.map((item) => item.incompleteCaId) } });
  const byCondition = new Map(conditions.map((item) => [String(item._id), item]));
  const subjectRefs = links.map((link) => {
    const condition = byCondition.get(String(link.incompleteCaId));
    return { subjectId: link.subjectId, subjectCode: condition?.subjectCode || '' };
  });
  const composed = await composeExamForm({
    userId: application.studentUserId,
    context,
    examYearId: application.academicYearId,
    examSemesterId: application.semesterId,
    subjectRefs,
  });
  if (hasSavedExamForm(application.form)) {
    return normalizeExamForm(serializeExamForm(application.form), composed);
  }
  return composed;
}
