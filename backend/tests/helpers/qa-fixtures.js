import { User } from '../../src/modules/authentication/models/user.model.js';
import { hashPassword } from '../../src/modules/authentication/security/passwords.js';
import { Department } from '../../src/modules/academic-foundation/models/department.model.js';
import { Batch } from '../../src/modules/academic-foundation/models/batch.model.js';
import { AcademicYear } from '../../src/modules/academic-foundation/models/academic-year.model.js';
import { Semester } from '../../src/modules/academic-foundation/models/semester.model.js';
import { Subject } from '../../src/modules/academic-foundation/models/subject.model.js';
import { SubjectOffering } from '../../src/modules/academic-foundation/models/subject-offering.model.js';
import { LecturerAssignment } from '../../src/modules/academic-foundation/models/lecturer-assignment.model.js';
import { StudentAcademicContext } from '../../src/modules/academic-foundation/models/student-academic-context.model.js';
import { AcademicResult } from '../../src/modules/results/models/academic-result.model.js';
import { Notification } from '../../src/modules/notifications/models/notification.model.js';
import { CaApplication } from '../../src/modules/ca-recovery/models/ca-application.model.js';
import { IncompleteCa } from '../../src/modules/ca-recovery/models/incomplete-ca.model.js';
import { ROLES } from '../../src/shared/constants/roles.js';

export const QA_PASSWORD = 'correcthorse';

/** Fictional identities only. Not real SEUSL students. */
export const QA_IDS = Object.freeze({
  STUDENT_A: 'student-a@qa.example.test',
  STUDENT_B: 'student-b@qa.example.test',
  STUDENT_C: 'student-c@qa.example.test',
  LECTURER_A: 'lecturer-a@qa.example.test',
  LECTURER_B: 'lecturer-b@qa.example.test',
  ADMIN_A: 'admin-a@qa.example.test',
  ADMIN_B: 'admin-b@qa.example.test',
});

async function user({ role, email, departmentId, lecturerStatus }) {
  return User.create({
    role,
    email,
    displayName: email.split('@')[0].toUpperCase().replaceAll('-', '_'),
    accountStatus: 'ACTIVE',
    departmentId,
    passwordHash: await hashPassword(QA_PASSWORD, { minLength: 10 }),
    lecturerStatus: lecturerStatus || (role === ROLES.LECTURER ? 'VERIFIED' : 'NOT_APPLICABLE'),
  });
}

export async function seedQaWorld() {
  const departmentA = await Department.create({ code: 'ICT', name: 'ICT QA' });
  const departmentB = await Department.create({ code: 'MGT', name: 'MGT QA' });
  const batchA = await Batch.create({ departmentId: departmentA._id, code: '22ICT', name: '22 ICT' });
  const batchOld = await Batch.create({ departmentId: departmentA._id, code: '21ICT', name: '21 ICT' });
  const year1 = await AcademicYear.create({ departmentId: departmentA._id, sequence: 1, name: 'Year 1' });
  const year2 = await AcademicYear.create({ departmentId: departmentA._id, sequence: 2, name: 'Year 2' });
  const sem1 = await Semester.create({
    departmentId: departmentA._id,
    academicYearId: year1._id,
    sequence: 1,
    name: 'Semester 1',
  });
  const sem2 = await Semester.create({
    departmentId: departmentA._id,
    academicYearId: year2._id,
    sequence: 1,
    name: 'Semester 1 Y2',
  });
  const subjectA = await Subject.create({
    departmentId: departmentA._id,
    code: 'ICT1233',
    name: 'Programming',
    credits: 3,
  });
  const subjectB = await Subject.create({
    departmentId: departmentA._id,
    code: 'ICT2344',
    name: 'Networks',
    credits: 3,
  });
  const offeringA = await SubjectOffering.create({
    departmentId: departmentA._id,
    subjectId: subjectA._id,
    batchId: batchA._id,
    academicYearId: year2._id,
    semesterId: sem2._id,
  });
  const offeringB = await SubjectOffering.create({
    departmentId: departmentA._id,
    subjectId: subjectB._id,
    batchId: batchA._id,
    academicYearId: year2._id,
    semesterId: sem2._id,
  });
  const offeringHist = await SubjectOffering.create({
    departmentId: departmentA._id,
    subjectId: subjectA._id,
    batchId: batchOld._id,
    academicYearId: year1._id,
    semesterId: sem1._id,
  });

  const adminA = await user({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: QA_IDS.ADMIN_A,
    departmentId: departmentA._id,
  });
  const adminB = await user({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    email: QA_IDS.ADMIN_B,
    departmentId: departmentB._id,
  });
  const lecturerA = await user({ role: ROLES.LECTURER, email: QA_IDS.LECTURER_A, departmentId: departmentA._id });
  const lecturerB = await user({ role: ROLES.LECTURER, email: QA_IDS.LECTURER_B, departmentId: departmentA._id });
  const studentA = await user({ role: ROLES.STUDENT, email: QA_IDS.STUDENT_A, departmentId: departmentA._id });
  const studentB = await user({ role: ROLES.STUDENT, email: QA_IDS.STUDENT_B, departmentId: departmentA._id });
  const studentC = await user({ role: ROLES.STUDENT, email: QA_IDS.STUDENT_C, departmentId: departmentB._id });

  await LecturerAssignment.create({
    departmentId: departmentA._id,
    lecturerUserId: lecturerA._id,
    subjectOfferingId: offeringA._id,
    assignedByUserId: adminA._id,
    isActive: true,
  });
  await LecturerAssignment.create({
    departmentId: departmentA._id,
    lecturerUserId: lecturerB._id,
    subjectOfferingId: offeringB._id,
    assignedByUserId: adminA._id,
    isActive: true,
  });

  await StudentAcademicContext.create({
    userId: studentA._id,
    departmentId: departmentA._id,
    batchId: batchOld._id,
    currentAcademicYearId: year2._id,
    currentSemesterId: sem2._id,
    registrationNumber: 'SEU/IS/21/ICT/A01',
  });
  await StudentAcademicContext.create({
    userId: studentB._id,
    departmentId: departmentA._id,
    batchId: batchA._id,
    currentAcademicYearId: year2._id,
    currentSemesterId: sem2._id,
    registrationNumber: 'SEU/IS/22/ICT/B01',
  });

  const resultA = await AcademicResult.create({
    departmentId: departmentA._id,
    studentUserId: studentA._id,
    registrationNumber: 'SEU/IS/21/ICT/A01',
    subjectId: subjectA._id,
    subjectCode: 'ICT1233',
    subjectOfferingId: offeringHist._id,
    studentAcademicYearId: year1._id,
    studentSemesterId: sem1._id,
    resultCode: 'B',
    previousResultCode: '',
    version: 1,
    isEca: false,
  });
  const resultB = await AcademicResult.create({
    departmentId: departmentA._id,
    studentUserId: studentB._id,
    registrationNumber: 'SEU/IS/22/ICT/B01',
    subjectId: subjectA._id,
    subjectCode: 'ICT1233',
    subjectOfferingId: offeringA._id,
    studentAcademicYearId: year2._id,
    studentSemesterId: sem2._id,
    resultCode: 'E(CA)',
    previousResultCode: '',
    version: 1,
    isEca: true,
  });

  const noticeA = await Notification.create({
    recipientUserId: studentA._id,
    type: 'RESULTS_UPDATED',
    sourceModule: 'results',
    sourceId: 'qa',
    channel: 'IN_APP',
    status: 'PENDING',
    category: 'results',
    title: 'Results',
    body: 'Updated',
    actionPath: '/results/me',
    departmentId: departmentA._id,
    mandatory: true,
    locale: 'en',
    idempotencyKey: `qa:notice:${studentA._id}`,
  });
  const noticeB = await Notification.create({
    recipientUserId: studentB._id,
    type: 'RESULTS_UPDATED',
    sourceModule: 'results',
    sourceId: 'qa',
    channel: 'IN_APP',
    status: 'PENDING',
    category: 'results',
    title: 'Results',
    body: 'Updated',
    actionPath: '/results/me',
    departmentId: departmentA._id,
    mandatory: true,
    locale: 'en',
    idempotencyKey: `qa:notice:${studentB._id}`,
  });

  const incompleteB = await IncompleteCa.create({
    studentUserId: studentB._id,
    registrationNumber: 'SEU/IS/22/ICT/B01',
    subjectId: subjectA._id,
    subjectCode: 'ICT1233',
    academicYearId: year2._id,
    semesterId: sem2._id,
    academicResultId: resultB._id,
    departmentId: departmentA._id,
    status: 'OPEN',
  });

  const applicationB = await CaApplication.create({
    applicationId: 'QA-APP-B-0001',
    departmentId: departmentA._id,
    studentUserId: studentB._id,
    registrationNumber: 'SEU/IS/22/ICT/B01',
    academicYearId: year2._id,
    semesterId: sem2._id,
    windowOpensAt: new Date(Date.now() - 86400000),
    windowClosesAt: new Date(Date.now() + 86400000),
    workflowStatus: 'DRAFT',
  });

  return {
    departmentA,
    departmentB,
    batchA,
    batchOld,
    year1,
    year2,
    sem1,
    sem2,
    subjectA,
    subjectB,
    offeringA,
    offeringB,
    offeringHist,
    adminA,
    adminB,
    lecturerA,
    lecturerB,
    studentA,
    studentB,
    studentC,
    resultA,
    resultB,
    noticeA,
    noticeB,
    incompleteB,
    applicationB,
  };
}
