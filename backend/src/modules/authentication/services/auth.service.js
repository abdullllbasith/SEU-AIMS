import { createOpaqueToken, hashSecret, signAccessToken } from '../security/tokens.js';
import { hashPassword, verifyPassword } from '../security/passwords.js';
import { createSession, rotateSession, revokeSessionByRefreshToken, revokeUserSessions } from './session.service.js';
import { findUserByLoginIdentifier } from './identity-lookup.service.js';
import { ACCOUNT_STATUSES, User } from '../models/user.model.js';
import { AuthSession } from '../models/auth-session.model.js';
import { PasswordResetToken } from '../models/password-reset-token.model.js';
import { UnauthorizedError, ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { isApprovedRole, ROLES } from '../../../shared/constants/roles.js';
import { isUsableAccount } from '../policies/authorization.policies.js';
import { recordAudit as persistAudit } from '../../audit-security/services/record-audit.service.js';
import { disconnectStudyRoomSockets } from '../../study-room/index.js';

const GENERIC_LOGIN_ERROR = 'Invalid credentials';

function publicUser(user, extras = {}) {
  return {
    id: String(user._id),
    role: user.role,
    accountStatus: user.accountStatus,
    email: user.email,
    displayName: user.displayName || '',
    departmentId: user.departmentId ? String(user.departmentId) : null,
    lecturerStatus: user.lecturerStatus,
    ...extras,
  };
}

async function recordAudit({ actorUserId, action, entityId, metadata }) {
  await persistAudit({
    actorUserId,
    action,
    entityType: 'User',
    entityId,
    metadata,
  });
}

export async function login({ identifier, password, userAgent, ip, config }) {
  const user = await findUserByLoginIdentifier(identifier);
  if (!user || !user.passwordHash || !isUsableAccount(user)) {
    throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
  }

  const matches = await verifyPassword(user.passwordHash, password);
  if (!matches) {
    throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
  }

  const { session, refreshToken } = await createSession({ user, userAgent, ip, config });
  const accessToken = signAccessToken({ user, session, config });
  const csrfToken = createOpaqueToken();
  await recordAudit({
    actorUserId: user._id,
    action: 'auth.login',
    entityId: user._id,
  });
  return { user: publicUser(user), accessToken, refreshToken, csrfToken };
}

export async function refresh({ refreshToken, userAgent, ip, config }) {
  if (!refreshToken) {
    throw new UnauthorizedError('Authentication required');
  }

  const rotation = await rotateSession({ presentedToken: refreshToken, userAgent, ip, config });
  if (rotation.reuseDetected) {
    throw new UnauthorizedError('Authentication required');
  }
  if (!rotation.session) {
    throw new UnauthorizedError('Authentication required');
  }

  const user = await User.findById(rotation.session.userId);
  if (!user || !isUsableAccount(user)) {
    throw new UnauthorizedError('Authentication required');
  }

  const accessToken = signAccessToken({ user, session: rotation.session, config });
  return {
    user: publicUser(user),
    accessToken,
    refreshToken: rotation.refreshToken,
    csrfToken: createOpaqueToken(),
  };
}

export async function logout({ refreshToken }) {
  let session = null;
  if (refreshToken) {
    session = await AuthSession.findOne({ refreshTokenHash: hashSecret(refreshToken) });
  }
  await revokeSessionByRefreshToken(refreshToken);
  if (session) {
    disconnectStudyRoomSockets({
      sessionId: String(session._id),
      userId: String(session.userId),
    });
  }
}

export async function changePassword({ userId, currentPassword, nextPassword, config }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new UnauthorizedError(GENERIC_LOGIN_ERROR);
  }

  user.passwordHash = await hashPassword(nextPassword, { minLength: config.auth.passwordMinLength });
  user.authVersion += 1;
  await user.save();
  await revokeUserSessions(user._id);
  disconnectStudyRoomSockets({ userId: String(user._id) });
  await recordAudit({ actorUserId: user._id, action: 'auth.password-change', entityId: user._id });
}

export async function requestPasswordReset({ identifier, config, emailProvider }) {
  const user = await findUserByLoginIdentifier(identifier);
  if (user && isUsableAccount(user)) {
    const token = createOpaqueToken();
    await PasswordResetToken.create({
      userId: user._id,
      tokenHash: hashSecret(token),
      expiresAt: new Date(Date.now() + config.auth.resetTtlSeconds * 1000),
    });
    await emailProvider.send({
      to: user.email,
      subject: 'Password reset',
      text: 'A password reset was requested for your SEU-AIMS account.',
    });
  }
}

export async function resetPassword({ token, nextPassword, config }) {
  const record = await PasswordResetToken.findOne({ tokenHash: hashSecret(token) });
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw new UnauthorizedError('Invalid or expired reset token');
  }

  const user = await User.findById(record.userId);
  if (!user) {
    throw new UnauthorizedError('Invalid or expired reset token');
  }

  user.passwordHash = await hashPassword(nextPassword, { minLength: config.auth.passwordMinLength });
  user.authVersion += 1;
  record.usedAt = new Date();
  await user.save();
  await record.save();
  await revokeUserSessions(user._id);
  disconnectStudyRoomSockets({ userId: String(user._id) });
  await recordAudit({ actorUserId: user._id, action: 'auth.password-reset', entityId: user._id });
}

export async function createUserAsAdmin({ actor, email, password, role, displayName, config }) {
  if (actor.role !== ROLES.DEPARTMENT_ADMINISTRATOR) {
    throw new ForbiddenError('Forbidden');
  }
  if (!actor.departmentId) {
    throw new ValidationError('Department is not configured for this administrator');
  }
  if (!isApprovedRole(role) || role === 'HOD') {
    throw new ValidationError('Invalid role');
  }

  const user = await User.create({
    email,
    displayName,
    role,
    departmentId: actor.departmentId,
    accountStatus: 'ACTIVE',
    lecturerStatus: role === ROLES.LECTURER ? 'UNVERIFIED' : 'NOT_APPLICABLE',
    passwordHash: await hashPassword(password, { minLength: config.auth.passwordMinLength }),
  });
  await recordAudit({
    actorUserId: actor.userId,
    action: 'auth.user-create',
    entityId: user._id,
    metadata: { role },
  });
  return publicUser(user);
}

const MANAGED_ACCOUNT_ROLES = new Set([ROLES.STUDENT, ROLES.LECTURER]);

function assertDepartmentActor(actor) {
  if (!actor || actor.role !== ROLES.DEPARTMENT_ADMINISTRATOR) {
    throw new ForbiddenError('Forbidden');
  }
  if (!actor.departmentId) {
    throw new ValidationError('Department is not configured for this administrator');
  }
}

async function loadManagedAccount(actor, userId) {
  assertDepartmentActor(actor);
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !user.departmentId || String(user.departmentId) !== String(actor.departmentId)) {
    throw new NotFoundError('User not found');
  }
  if (!MANAGED_ACCOUNT_ROLES.has(user.role)) {
    throw new ValidationError('Only student and lecturer accounts can be changed here');
  }
  return user;
}

export async function setAccountStatus({ actor, userId, accountStatus }) {
  if (!ACCOUNT_STATUSES.includes(accountStatus)) {
    throw new ValidationError('Invalid account status');
  }
  const user = await loadManagedAccount(actor, userId);

  user.accountStatus = accountStatus;
  user.authVersion += 1;
  await user.save();
  if (accountStatus !== 'ACTIVE') {
    await revokeUserSessions(user._id);
  }
  disconnectStudyRoomSockets({ userId: String(user._id) });
  await recordAudit({
    actorUserId: actor.userId,
    action: 'auth.account-status',
    entityId: user._id,
    metadata: { accountStatus },
  });
  return publicUser(user);
}

export async function setPasswordAsAdmin({ actor, userId, password, config }) {
  const user = await loadManagedAccount(actor, userId);
  user.passwordHash = await hashPassword(password, { minLength: config.auth.passwordMinLength });
  user.authVersion += 1;
  await user.save();
  await revokeUserSessions(user._id);
  disconnectStudyRoomSockets({ userId: String(user._id) });
  await recordAudit({
    actorUserId: actor.userId,
    action: 'auth.admin-password-set',
    entityId: user._id,
    metadata: { role: user.role },
  });
  return { passwordUpdated: true };
}

export function toPublicUser(user, extras) {
  return publicUser(user, extras);
}
