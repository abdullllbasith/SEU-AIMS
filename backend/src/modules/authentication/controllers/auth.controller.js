import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import { ValidationError, ForbiddenError } from '../../../shared/errors/app-error.js';
import { createOpaqueToken } from '../security/tokens.js';
import { setAuthCookies, clearAuthCookies } from '../security/cookies.js';
import {
  login,
  logout,
  refresh,
  changePassword,
  requestPasswordReset,
  resetPassword,
  createUserAsAdmin,
  setAccountStatus,
  setPasswordAsAdmin,
  listAdmins,
  createAdminAccount,
  setAdminAccountStatus,
  resetAdminPassword,
  toPublicUser,
} from '../services/auth.service.js';
import { findStudentContextByUserId } from '../../academic-foundation/index.js';
import { canAccessStudyRoom } from '../policies/authorization.policies.js';

export function createAuthController({ config, infrastructure }) {
  return {
    csrf: asyncHandler(async (req, res) => {
      const csrfToken = req.cookies?.[config.auth.csrfCookie] || createOpaqueToken();
      res.cookie(config.auth.csrfCookie, csrfToken, {
        httpOnly: false,
        secure: config.auth.cookieSecure,
        sameSite: config.auth.cookieSameSite,
        path: '/',
        maxAge: config.auth.refreshTtlSeconds * 1000,
      });
      sendSuccess(res, { csrfToken });
    }),

    login: asyncHandler(async (req, res) => {
      const { identifier, email, password } = req.body || {};
      const loginEmail = String(identifier || email || '').trim();
      if (config.auth.restrictLoginDomain && !/^[^\s@]+@seu\.ac\.lk$/i.test(loginEmail)) {
        throw new ValidationError('Only @seu.ac.lk email addresses can sign in');
      }
      const result = await login({
        identifier: loginEmail,
        password,
        userAgent: req.get('user-agent'),
        ip: req.ip,
        config,
      });
      setAuthCookies(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        csrfToken: result.csrfToken,
        config,
      });
      sendSuccess(res, { user: result.user, csrfToken: result.csrfToken });
    }),

    logout: asyncHandler(async (req, res) => {
      await logout({ refreshToken: req.cookies?.[config.auth.refreshCookie] });
      clearAuthCookies(res, { config });
      sendSuccess(res, { loggedOut: true });
    }),

    refresh: asyncHandler(async (req, res) => {
      const result = await refresh({
        refreshToken: req.cookies?.[config.auth.refreshCookie],
        userAgent: req.get('user-agent'),
        ip: req.ip,
        config,
      });
      setAuthCookies(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        csrfToken: result.csrfToken,
        config,
      });
      sendSuccess(res, { user: result.user, csrfToken: result.csrfToken });
    }),

    me: asyncHandler(async (req, res) => {
      const extras = {};
      if (req.principal.role === 'STUDENT') {
        const context = await findStudentContextByUserId(req.principal.userId);
        extras.registrationNumber = context?.registrationNumber || null;
      }
      extras.canAccessStudyRoom = canAccessStudyRoom(req.principal);
      sendSuccess(res, { user: toPublicUser(req.user, extras) });
    }),

    updateMe: asyncHandler(async (req, res) => {
      const { displayName, role, accountStatus, passwordHash } = req.body || {};
      if (role || accountStatus || passwordHash) {
        throw new ForbiddenError('Forbidden');
      }
      if (typeof displayName === 'string') {
        req.user.displayName = displayName.trim();
        await req.user.save();
      }
      sendSuccess(res, { user: toPublicUser(req.user) });
    }),

    changePassword: asyncHandler(async (req, res) => {
      const { currentPassword, nextPassword } = req.body || {};
      await changePassword({
        userId: req.principal.userId,
        currentPassword,
        nextPassword,
        config,
      });
      clearAuthCookies(res, { config });
      sendSuccess(res, { passwordChanged: true });
    }),

    forgotPassword: asyncHandler(async (req, res) => {
      await requestPasswordReset({
        identifier: req.body?.identifier || req.body?.email,
        config,
        emailProvider: infrastructure.email,
      });
      sendSuccess(res, { accepted: true });
    }),

    resetPassword: asyncHandler(async (req, res) => {
      const { token, nextPassword } = req.body || {};
      if (!token) {
        throw new ValidationError('Reset token is required');
      }
      await resetPassword({ token, nextPassword, config });
      sendSuccess(res, { reset: true });
    }),

    createUser: asyncHandler(async (req, res) => {
      const user = await createUserAsAdmin({
        actor: req.principal,
        email: req.body?.email,
        password: req.body?.password,
        role: req.body?.role,
        displayName: req.body?.displayName,
        config,
      });
      sendSuccess(res, { user }, { statusCode: 201 });
    }),

    setStatus: asyncHandler(async (req, res) => {
      const user = await setAccountStatus({
        actor: req.principal,
        userId: req.params.userId,
        accountStatus: req.body?.accountStatus,
      });
      sendSuccess(res, { user });
    }),

    setPassword: asyncHandler(async (req, res) => {
      const result = await setPasswordAsAdmin({
        actor: req.principal,
        userId: req.params.userId,
        password: req.body?.password,
        config,
      });
      sendSuccess(res, result);
    }),

    listAdmins: asyncHandler(async (req, res) => {
      const items = await listAdmins({ actor: req.principal });
      sendSuccess(res, { items });
    }),

    createAdmin: asyncHandler(async (req, res) => {
      const result = await createAdminAccount({
        actor: req.principal,
        email: req.body?.email,
        displayName: req.body?.displayName,
        config,
      });
      res.set('Cache-Control', 'no-store');
      sendSuccess(res, result, { statusCode: 201 });
    }),

    setAdminStatus: asyncHandler(async (req, res) => {
      const user = await setAdminAccountStatus({
        actor: req.principal,
        userId: req.params.userId,
        accountStatus: req.body?.accountStatus,
      });
      sendSuccess(res, { user });
    }),

    resetAdminPassword: asyncHandler(async (req, res) => {
      const result = await resetAdminPassword({
        actor: req.principal,
        userId: req.params.userId,
        config,
      });
      res.set('Cache-Control', 'no-store');
      sendSuccess(res, result);
    }),
  };
}
