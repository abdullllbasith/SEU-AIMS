import { UnauthorizedError, ForbiddenError } from '../errors/app-error.js';
import { ROLES } from '../constants/roles.js';
import { verifyAccessToken } from '../../modules/authentication/security/tokens.js';
import { User } from '../../modules/authentication/models/user.model.js';
import { AuthSession } from '../../modules/authentication/models/auth-session.model.js';
import { isUsableAccount } from '../../modules/authentication/policies/authorization.policies.js';
import { asyncHandler } from '../http/async-handler.js';

function normalizeRoles(roles) {
  return (Array.isArray(roles) ? roles : [roles]).map((role) =>
    role === 'DEPARTMENT_ADMIN' ? ROLES.DEPARTMENT_ADMINISTRATOR : role,
  );
}

export function requireAuthenticated(req, res, next) {
  const run = asyncHandler(async (request, _response, nxt) => {
    const config = request.app.get('config');
    const token = request.cookies?.[config.auth.accessCookie];
    if (!token) {
      throw new UnauthorizedError('Authentication required');
    }

    let payload;
    try {
      payload = verifyAccessToken(token, { config });
    } catch {
      throw new UnauthorizedError('Authentication required');
    }

    const user = await User.findById(payload.sub);
    if (!user || !isUsableAccount(user) || user.authVersion !== payload.authVersion) {
      throw new UnauthorizedError('Authentication required');
    }

    const session = await AuthSession.findById(payload.sid);
    if (!session || session.revokedAt || String(session.userId) !== String(user._id)) {
      throw new UnauthorizedError('Authentication required');
    }

    request.user = user;
    request.principal = {
      userId: String(user._id),
      role: user.role,
      departmentId: user.departmentId ? String(user.departmentId) : null,
      sessionId: String(session._id),
      authVersion: user.authVersion,
    };
    nxt();
  });

  return run(req, res, next);
}

export function requireRole(...roles) {
  const allowed = normalizeRoles(roles);
  return (req, res, next) => {
    requireAuthenticated(req, res, (error) => {
      if (error) {
        return next(error);
      }
      if (!req.principal || !allowed.includes(req.principal.role)) {
        return next(new ForbiddenError('Forbidden'));
      }
      return next();
    });
  };
}

export function requireDepartmentAdmin() {
  return requireRole(ROLES.DEPARTMENT_ADMINISTRATOR);
}
