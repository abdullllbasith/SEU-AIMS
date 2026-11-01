import { StudySession, StudyMessage } from '../models/index.js';
import { MAX_SESSION_TITLE_CHARS, SESSION_MODES } from '../constants.js';
import { ValidationError } from '../../../shared/errors/app-error.js';
import { conceal, parseLimit, requireObjectId } from '../utils/http.js';
import { mapMessage, mapSession } from '../mappers/study-agent.mappers.js';
import { requireAgentStudent } from './access.service.js';
import { requireAccessibleOffering } from './subject-context.service.js';

export const DEFAULT_SESSION_TITLE = 'New study session';

function cleanTitle(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_SESSION_TITLE_CHARS);
}

export async function createSession(principal, body = {}) {
  await requireAgentStudent(principal);
  if (!SESSION_MODES.includes(body.mode)) {
    throw new ValidationError('mode must be AUTO, SUBJECT or FREE');
  }
  if (body.mode === 'AUTO') {
    const session = await StudySession.create({ studentUserId: principal.userId, mode: 'AUTO' });
    return mapSession(session);
  }
  if (body.mode === 'SUBJECT') {
    const subject = await requireAccessibleOffering(principal, body.offeringId);
    const session = await StudySession.create({
      studentUserId: principal.userId,
      mode: 'SUBJECT',
      subjectOfferingId: subject.offeringId,
      subjectCode: subject.subjectCode,
      subjectName: subject.subjectName,
    });
    return mapSession(session);
  }
  const session = await StudySession.create({
    studentUserId: principal.userId,
    mode: 'FREE',
    title: cleanTitle(body.topic) || DEFAULT_SESSION_TITLE,
  });
  return mapSession(session);
}

export async function listSessions(principal, query = {}) {
  await requireAgentStudent(principal);
  const filter = { studentUserId: principal.userId, status: 'ACTIVE' };
  if (query.mode && SESSION_MODES.includes(query.mode)) {
    filter.mode = query.mode;
  }
  if (query.resumable === 'true') {
    filter.messageCount = { $gt: 0 };
  }
  const limit = parseLimit(query.limit, { max: 50, fallback: 20 });
  const items = await StudySession.find(filter).sort({ lastActivityAt: -1 }).limit(limit);
  return { items: items.map(mapSession) };
}

/** Owner-scoped lookup. Another student's session id is indistinguishable from a missing one. */
export async function loadOwnedSession(principal, sessionId, { allowArchived = false } = {}) {
  requireObjectId(sessionId, 'session');
  const session = await StudySession.findOne({ _id: sessionId, studentUserId: principal.userId });
  if (!session || (!allowArchived && session.status !== 'ACTIVE')) {
    throw conceal('Session');
  }
  return session;
}

export async function getSession(principal, sessionId, query = {}) {
  await requireAgentStudent(principal);
  const session = await loadOwnedSession(principal, sessionId);
  const limit = parseLimit(query.limit, { max: 100, fallback: 30 });
  const filter = { sessionId: session._id, studentUserId: principal.userId };
  if (query.before) {
    filter._id = { $lt: requireObjectId(query.before, 'cursor') };
  }
  const rows = await StudyMessage.find(filter).sort({ _id: -1 }).limit(limit + 1);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return {
    session: mapSession(session),
    messages: page.map(mapMessage),
    hasMore,
  };
}

export async function renameSession(principal, sessionId, body = {}) {
  await requireAgentStudent(principal);
  const session = await loadOwnedSession(principal, sessionId);
  const title = cleanTitle(body.title);
  if (!title) {
    throw new ValidationError('title is required');
  }
  session.title = title;
  await session.save();
  return mapSession(session);
}

export async function archiveSession(principal, sessionId) {
  await requireAgentStudent(principal);
  const session = await loadOwnedSession(principal, sessionId);
  session.status = 'ARCHIVED';
  await session.save();
  return { archived: true };
}
