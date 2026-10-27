import { User } from '../../authentication/index.js';
import {
  Batch,
  AcademicYear,
  Semester,
  StudentAcademicContext,
  StudentAcademicHistory,
} from '../../academic-foundation/index.js';
import { AcademicResult } from '../../results/index.js';
import { IncompleteCa } from '../../ca-recovery/index.js';
import { getStudentGpaSummary } from '../../gpa-cgpa/index.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { containsRegex, departmentObjectId, parseObjectId, parsePage, sanitizeSearch } from './scope.js';

function mapId(value) {
  return value ? String(value) : null;
}

export async function listStudents(principal, query = {}) {
  const departmentId = departmentObjectId(principal);
  const { page, pageSize } = parsePage(query);
  const q = sanitizeSearch(query.q);
  const batchId = parseObjectId(query.batchId, 'batchId');
  const academicYearId = parseObjectId(query.academicYearId, 'academicYearId');
  const semesterId = parseObjectId(query.semesterId, 'semesterId');

  const contextFilter = { departmentId };
  if (batchId) {
    contextFilter.batchId = batchId;
  }
  if (academicYearId) {
    contextFilter.currentAcademicYearId = academicYearId;
  }
  if (semesterId) {
    contextFilter.currentSemesterId = semesterId;
  }
  if (query.accountStatus) {
    const allowed = ['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'];
    if (!allowed.includes(query.accountStatus)) {
      throw new ValidationError('Invalid accountStatus');
    }
  }

  let userFilter = { departmentId, role: ROLES.STUDENT };
  if (query.accountStatus) {
    userFilter.accountStatus = query.accountStatus;
  }

  if (q || batchId || academicYearId || semesterId) {
    const registrationFilter = {
      ...contextFilter,
      ...(q ? { registrationNumber: containsRegex(q.toUpperCase()) } : {}),
    };
    const matchedContexts = await StudentAcademicContext.find(registrationFilter)
      .select('userId')
      .limit(q ? 200 : 5000)
      .lean();
    const ids = new Set(matchedContexts.map((row) => String(row.userId)));
    if (q) {
      const namedUsers = await User.find({
        departmentId,
        role: ROLES.STUDENT,
        displayName: containsRegex(q),
      })
        .select('_id')
        .limit(200)
        .lean();
      if (namedUsers.length) {
        const namedContexts = await StudentAcademicContext.find({
          ...contextFilter,
          userId: { $in: namedUsers.map((user) => user._id) },
        })
          .select('userId')
          .lean();
        for (const row of namedContexts) {
          ids.add(String(row.userId));
        }
      }
    }
    userFilter._id = { $in: [...ids] };
  }

  const [users, total] = await Promise.all([
    User.find(userFilter)
      .select('displayName email accountStatus')
      .sort({ displayName: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    User.countDocuments(userFilter),
  ]);
  const contexts = await StudentAcademicContext.find({
    departmentId,
    userId: { $in: users.map((user) => user._id) },
  })
    .select('userId registrationNumber batchId currentAcademicYearId currentSemesterId status')
    .lean();

  const pageUserIds = users.map((user) => user._id);
  const [batches, years, semesters, ecaRows] = await Promise.all([
    Batch.find({ departmentId }).select('code name').lean(),
    AcademicYear.find({ departmentId }).select('name sequence').lean(),
    Semester.find({ departmentId }).select('name sequence').lean(),
    IncompleteCa.aggregate([
      { $match: { departmentId, status: 'OPEN', studentUserId: { $in: pageUserIds } } },
      { $group: { _id: '$studentUserId', count: { $sum: 1 } } },
    ]),
  ]);
  const batchById = new Map(batches.map((item) => [String(item._id), item]));
  const yearById = new Map(years.map((item) => [String(item._id), item]));
  const semById = new Map(semesters.map((item) => [String(item._id), item]));
  const ecaByUser = new Map(ecaRows.map((row) => [String(row._id), row.count]));
  const contextByUser = new Map(contexts.map((row) => [String(row.userId), row]));

  return {
    page,
    pageSize,
    total,
    items: users.map((user) => {
      const context = contextByUser.get(String(user._id));
      const batch = context ? batchById.get(String(context.batchId)) : null;
      const year = context ? yearById.get(String(context.currentAcademicYearId)) : null;
      const semester = context ? semById.get(String(context.currentSemesterId)) : null;
      return {
        userId: String(user._id),
        displayName: user.displayName || '',
        email: user.email,
        accountStatus: user.accountStatus,
        registrationNumber: context?.registrationNumber || null,
        academicContextStatus: context?.status || null,
        batchCode: batch?.code || null,
        academicYear: year?.name || null,
        semester: semester?.name || null,
        unresolvedEcaCount: ecaByUser.get(String(user._id)) || 0,
      };
    }),
  };
}

export async function getStudentDetail(principal, userIdParam) {
  const departmentId = departmentObjectId(principal);
  const userId = parseObjectId(userIdParam, 'userId');
  if (!userId) {
    throw new ValidationError('Invalid userId');
  }
  const user = await User.findOne({ _id: userId, departmentId, role: ROLES.STUDENT }).select(
    'displayName email accountStatus',
  );
  if (!user) {
    throw new NotFoundError('Student not found');
  }
  const context = await StudentAcademicContext.findOne({ userId, departmentId }).lean();
  const [history, results, openEca, gpa] = await Promise.all([
    StudentAcademicHistory.find({ userId }).sort({ recordedAt: 1 }).lean(),
    AcademicResult.find({ studentUserId: userId, departmentId })
      .select('subjectCode resultCode isEca version')
      .sort({ subjectCode: 1 })
      .lean(),
    IncompleteCa.countDocuments({ studentUserId: userId, departmentId, status: 'OPEN' }),
    getStudentGpaSummary(userId),
  ]);

  return {
    userId: String(user._id),
    displayName: user.displayName || '',
    email: user.email,
    accountStatus: user.accountStatus,
    registrationNumber: context?.registrationNumber || null,
    academicContext: context
      ? {
          batchId: mapId(context.batchId),
          academicYearId: mapId(context.currentAcademicYearId),
          semesterId: mapId(context.currentSemesterId),
          status: context.status,
        }
      : null,
    history: history.map((row) => ({
      academicYearId: mapId(row.academicYearId),
      semesterId: mapId(row.semesterId),
      recordedAt: row.recordedAt,
    })),
    results: results.map((row) => ({
      subjectCode: row.subjectCode,
      resultCode: row.resultCode,
      isEca: row.isEca,
      version: row.version,
    })),
    unresolvedEcaCount: openEca,
    gpa: {
      gpa: gpa.gpa,
      credits: gpa.credits,
      status: gpa.status,
      engine: gpa.engine,
    },
    notes: [
      'This view does not edit official results.',
      'Account status changes remain on the authentication APIs.',
    ],
  };
}
