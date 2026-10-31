import { User } from '../../modules/authentication/models/user.model.js';
import { AuthSession } from '../../modules/authentication/models/auth-session.model.js';
import { PasswordResetToken } from '../../modules/authentication/models/password-reset-token.model.js';
import {
  Department,
  Batch,
  AcademicYear,
  Semester,
  Subject,
  CurriculumMapping,
  SubjectOffering,
  LecturerAssignment,
  StudentAcademicContext,
  StudentAcademicHistory,
} from '../../modules/academic-foundation/index.js';
import { OfficialResource, ResourceSection } from '../../modules/learning-environment/index.js';
import {
  Conversation,
  Message,
  SharedFolder,
  SharedResource,
  StudyRoomSettings,
  CryptoPublicKey,
  ConversationKeyEnvelope,
  MessageReceipt,
  ResourceReport,
} from '../../modules/study-room/index.js';
import { ResultImport, ResultImportRow, AcademicResult, ResultRevision } from '../../modules/results/index.js';
import { GpaSnapshot } from '../../modules/gpa-cgpa/index.js';
import {
  IncompleteCa,
  CaApplication,
  CaApplicationSubject,
  CaApplicationEvent,
  CaSchedule,
  CaExamNotice,
  CaApplicationWindow,
} from '../../modules/ca-recovery/index.js';
import { Notice, CalendarEvent } from '../../modules/notices-calendar/index.js';
import { Notification, NotificationPreference, NotificationTemplate } from '../../modules/notifications/index.js';
import { StoredFile } from '../../modules/files/index.js';
import { AuditEvent } from '../../modules/audit-security/index.js';

export function registerModels() {
  return {
    User,
    AuthSession,
    PasswordResetToken,
    Department,
    Batch,
    AcademicYear,
    Semester,
    Subject,
    CurriculumMapping,
    SubjectOffering,
    LecturerAssignment,
    StudentAcademicContext,
    StudentAcademicHistory,
    OfficialResource,
    ResourceSection,
    Conversation,
    Message,
    SharedFolder,
    SharedResource,
    StudyRoomSettings,
    CryptoPublicKey,
    ConversationKeyEnvelope,
    MessageReceipt,
    ResourceReport,
    ResultImport,
    ResultImportRow,
    AcademicResult,
    ResultRevision,
    GpaSnapshot,
    IncompleteCa,
    CaApplication,
    CaApplicationSubject,
    CaApplicationEvent,
    CaSchedule,
    CaExamNotice,
    CaApplicationWindow,
    Notice,
    CalendarEvent,
    Notification,
    NotificationPreference,
    NotificationTemplate,
    StoredFile,
    AuditEvent,
  };
}
