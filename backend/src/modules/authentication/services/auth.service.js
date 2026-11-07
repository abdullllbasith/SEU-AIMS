import { renderPasswordResetEmail } from '../../../infrastructure/providers/email-templates.js';
import { createOpaqueToken, hashSecret, signAccessToken } from '../security/tokens.js';
import { hashPassword, verifyPassword } from '../security/passwords.js';
import { createSession, rotateSession, revokeSessionByRefreshToken, revokeUserSessions } from './session.service.js';
import { findUserByLoginIdentifier } from './identity-lookup.service.js';
import { ACCOUNT_STATUSES, User } from '../models/user.model.js';
import { AuthSession } from '../models/auth-session.model.js';
import { PasswordResetToken } from '../models/password-reset-token.model.js';
import { randomBytes } from 'node:crypto';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../../../shared/errors/app-error.js';
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
    const frontendBase = String(config.api.corsOrigin || '').split(',')[0].trim().replace(/\/+$/, '');
    const resetUrl = `${frontendBase}/reset-password?token=${encodeURIComponent(token)}`;
    await emailProvider.send({
      to: user.email,
      ...renderPasswordResetEmail({ resetUrl, ttlMinutes: Math.round(config.auth.resetTtlSeconds / 60) }),
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

// ---- Department administrator account management (admin -> admin) ----

const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Random password with no look-alike characters. Always meets the configured minimum. */
export function generateTemporaryPassword(minLength = 10) {
  const length = Math.max(16, Number(minLength) || 0);
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += TEMP_PASSWORD_ALPHABET[bytes[i] % TEMP_PASSWORD_ALPHABET.length];
  }
  return out;
}

async function loadManagedAdmin(actor, userId) {
  assertDepartmentActor(actor);
  const user = await User.findById(userId).select('+passwordHash');
  if (
    !user ||
    user.role !== ROLES.DEPARTMENT_ADMINISTRATOR ||
    !user.departmentId ||
    String(user.departmentId) !== String(actor.departmentId)
  ) {
    throw new NotFoundError('Administrator not found');
  }
  return user;
}

export async function listAdmins({ actor }) {
  assertDepartmentActor(actor);
  const admins = await User.find({
    role: ROLES.DEPARTMENT_ADMINISTRATOR,
    departmentId: actor.departmentId,
  })
    .sort({ displayName: 1, email: 1 })
    .lean();
  return admins.map((admin) => ({
    ...publicUser(admin),
    createdAt: admin.createdAt,
    isSelf: String(admin._id) === String(actor.userId),
  }));
}

export async function createAdminAccount({ actor, email, displayName, config }) {
  assertDepartmentActor(actor);
  const loginEmail = String(email || '').trim().toLowerCase();
  const name = String(displayName || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) {
    throw new ValidationError('A valid email address is required');
  }
  if (config.auth.restrictLoginDomain && !/^[^\s@]+@seu\.ac\.lk$/i.test(loginEmail)) {
    throw new ValidationError('Only @seu.ac.lk email addresses can sign in');
  }
  if (!name || name.length > 120) {
    throw new ValidationError('Display name is required (max 120 characters)');
  }
  if (await User.exists({ email: loginEmail })) {
    throw new ConflictError('An account with this email already exists');
  }

  const temporaryPassword = generateTemporaryPassword(config.auth.passwordMinLength);
  let user;
  try {
    user = await User.create({
      email: loginEmail,
      displayName: name,
      role: ROLES.DEPARTMENT_ADMINISTRATOR,
      departmentId: actor.departmentId,
      accountStatus: 'ACTIVE',
      lecturerStatus: 'NOT_APPLICABLE',
      passwordHash: await hashPassword(temporaryPassword, { minLength: config.auth.passwordMinLength }),
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ConflictError('An account with this email already exists');
    }
    throw error;
  }
  await recordAudit({
    actorUserId: actor.userId,
    action: 'auth.admin-create',
    entityId: user._id,
    metadata: { role: ROLES.DEPARTMENT_ADMINISTRATOR },
  });
  return { user: publicUser(user), temporaryPassword };
}

export async function setAdminAccountStatus({ actor, userId, accountStatus }) {
  if (!['ACTIVE', 'SUSPENDED'].includes(accountStatus)) {
    throw new ValidationError('Invalid account status');
  }
  const user = await loadManagedAdmin(actor, userId);

  if (accountStatus === 'SUSPENDED') {
    if (String(user._id) === String(actor.userId)) {
      throw new ValidationError('You cannot suspend your own account');
    }
    if (user.accountStatus === 'ACTIVE') {
      const otherActive = await User.countDocuments({
        role: ROLES.DEPARTMENT_ADMINISTRATOR,
        departmentId: actor.departmentId,
        accountStatus: 'ACTIVE',
        _id: { $ne: user._id },
      });
      if (otherActive < 1) {
        throw new ValidationError('Cannot suspend the last active administrator in this department');
      }
    }
  }

  user.accountStatus = accountStatus;
  user.authVersion += 1;
  await user.save();
  if (accountStatus !== 'ACTIVE') {
    await revokeUserSessions(user._id);
  }
  await recordAudit({
    actorUserId: actor.userId,
    action: 'auth.admin-status',
    entityId: user._id,
    metadata: { accountStatus },
  });
  return publicUser(user);
}

export async function resetAdminPassword({ actor, userId, config }) {
  const user = await loadManagedAdmin(actor, userId);
  if (String(user._id) === String(actor.userId)) {
    throw new ValidationError('Use Change password to update your own password');
  }
  const temporaryPassword = generateTemporaryPassword(config.auth.passwordMinLength);
  user.passwordHash = await hashPassword(temporaryPassword, { minLength: config.auth.passwordMinLength });
  user.authVersion += 1;
  await user.save();
  await revokeUserSessions(user._id);
  await recordAudit({
    actorUserId: actor.userId,
    action: 'auth.admin-password-reset',
    entityId: user._id,
    metadata: { role: user.role },
  });
  return { temporaryPassword };
}

export function toPublicUser(user, extras) {
  return publicUser(user, extras);
}
