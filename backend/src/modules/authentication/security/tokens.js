import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

export function hashSecret(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function createOpaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function signAccessToken({ user, session, config }) {
  return jwt.sign(
    {
      sub: String(user._id),
      role: user.role,
      authVersion: user.authVersion,
      sid: String(session._id),
    },
    config.auth.jwtSecret,
    {
      expiresIn: config.auth.accessTtlSeconds,
      issuer: 'seu-aims',
    },
  );
}

export function verifyAccessToken(token, { config }) {
  return jwt.verify(token, config.auth.jwtSecret, { issuer: 'seu-aims' });
}
