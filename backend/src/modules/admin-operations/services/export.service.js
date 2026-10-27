import { User } from '../../authentication/index.js';
import { Batch, AcademicYear, Semester, StudentAcademicContext } from '../../academic-foundation/index.js';
import { recordAudit } from '../../audit-security/index.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { ValidationError } from '../../../shared/errors/app-error.js';
import { EXPORT_STUDENT_MAX_ROWS } from '../constants.js';
import { departmentObjectId, parseObjectId, sanitizeSearch, prefixRegex } from './scope.js';

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}

export async function exportStudentsCsv(principal, query = {}, { ip, userAgent, actorUserId } = {}) {
  const departmentId = departmentObjectId(principal);
  const q = sanitizeSearch(query.q);
  const batchId = parseObjectId(query.batchId, 'batchId');
  const contextFilter = { departmentId };
  if (batchId) {
    contextFilter.batchId = batchId;
  }
  if (q && q.includes('/')) {
    contextFilter.registrationNumber = prefixRegex(q.toUpperCase());
  }
  const contexts = await StudentAcademicContext.find(contextFilter)
    .select('userId registrationNumber batchId currentAcademicYearId currentSemesterId')
    .lean();
  const userFilter = {
    departmentId,
    role: ROLES.STUDENT,
    _id: { $in: contexts.map((row) => row.userId) },
  };
  if (q && !q.includes('/')) {
    userFilter.displayName = prefixRegex(q);
  }

  const total = await User.countDocuments(userFilter);
  if (total > EXPORT_STUDENT_MAX_ROWS) {
    throw new ValidationError(
      `Export is limited to ${EXPORT_STUDENT_MAX_ROWS} rows. Narrow the search or batch filter. Asynchronous bulk export is not implemented.`,
    );
  }

  const users = await User.find(userFilter)
    .select('displayName email accountStatus')
    .sort({ displayName: 1 })
    .limit(EXPORT_STUDENT_MAX_ROWS)
    .lean();
  const [batches, years, semesters] = await Promise.all([
    Batch.find({ departmentId }).select('code').lean(),
    AcademicYear.find({ departmentId }).select('name').lean(),
    Semester.find({ departmentId }).select('name').lean(),
  ]);
  const batchById = new Map(batches.map((item) => [String(item._id), item.code]));
  const yearById = new Map(years.map((item) => [String(item._id), item.name]));
  const semById = new Map(semesters.map((item) => [String(item._id), item.name]));
  const contextByUser = new Map(contexts.map((row) => [String(row.userId), row]));

  const header = [
    'registrationNumber',
    'displayName',
    'email',
    'accountStatus',
    'batchCode',
    'academicYear',
    'semester',
  ];
  const lines = [header.join(',')];
  for (const user of users) {
    const context = contextByUser.get(String(user._id));
    lines.push(
      [
        csvCell(context?.registrationNumber),
        csvCell(user.displayName),
        csvCell(user.email),
        csvCell(user.accountStatus),
        csvCell(context ? batchById.get(String(context.batchId)) : ''),
        csvCell(context ? yearById.get(String(context.currentAcademicYearId)) : ''),
        csvCell(context ? semById.get(String(context.currentSemesterId)) : ''),
      ].join(','),
    );
  }

  await recordAudit({
    actorUserId,
    actorRole: principal.role,
    departmentId,
    action: 'admin.export.students',
    entityType: 'StudentDirectory',
    entityId: String(departmentId),
    sourceModule: 'admin-operations',
    metadata: { rowCount: users.length, filters: { q: q || null, batchId: batchId ? String(batchId) : null } },
    ip,
    userAgent,
  });

  return {
    filename: 'students.csv',
    csv: `${lines.join('\n')}\n`,
    rowCount: users.length,
  };
}
