import { verifyAccessToken } from '../../authentication/security/tokens.js';
import { User } from '../../authentication/models/user.model.js';
import { AuthSession } from '../../authentication/models/auth-session.model.js';
import { isUsableAccount } from '../../authentication/policies/authorization.policies.js';

export function parseCookieHeader(header) {
  const out = {};
  if (!header) {
    return out;
  }
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index === -1) {
      continue;
    }
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export async function resolveLivePrincipal({ userId, sessionId, authVersion }) {
  const user = await User.findById(userId);
  if (!user || !isUsableAccount(user) || (authVersion !== undefined && user.authVersion !== authVersion)) {
    throw new Error('Authentication required');
  }
  const session = await AuthSession.findById(sessionId);
  if (!session || session.revokedAt || String(session.userId) !== String(user._id)) {
    throw new Error('Authentication required');
  }
  return {
    userId: String(user._id),
    role: user.role,
    departmentId: user.departmentId ? String(user.departmentId) : null,
    sessionId: String(session._id),
    authVersion: user.authVersion,
  };
}

export async function authenticateSocket(socket, { config }) {
  const cookies = parseCookieHeader(socket.handshake.headers.cookie);
  const token = cookies[config.auth.accessCookie];
  if (!token) {
    throw new Error('Authentication required');
  }
  const payload = verifyAccessToken(token, { config });
  return resolveLivePrincipal({
    userId: payload.sub,
    sessionId: payload.sid,
    authVersion: payload.authVersion,
  });
}
