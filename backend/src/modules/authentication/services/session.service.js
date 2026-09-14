import { randomUUID } from 'node:crypto';
import { AuthSession } from '../models/auth-session.model.js';
import { createOpaqueToken, hashSecret } from '../security/tokens.js';

export async function createSession({ user, userAgent, ip, config }) {
  const refreshToken = createOpaqueToken();
  const session = await AuthSession.create({
    userId: user._id,
    familyId: randomUUID(),
    refreshTokenHash: hashSecret(refreshToken),
    expiresAt: new Date(Date.now() + config.auth.refreshTtlSeconds * 1000),
    userAgent,
    ip,
  });
  return { session, refreshToken };
}

export async function rotateSession({ presentedToken, userAgent, ip, config }) {
  const presentedHash = hashSecret(presentedToken);
  const current = await AuthSession.findOne({ refreshTokenHash: presentedHash });

  if (!current) {
    return { reuseDetected: false, session: null };
  }

  if (current.revokedAt) {
    await AuthSession.updateMany(
      { familyId: current.familyId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    return { reuseDetected: true, session: null };
  }

  if (current.expiresAt.getTime() <= Date.now()) {
    current.revokedAt = new Date();
    await current.save();
    return { reuseDetected: false, session: null };
  }

  const refreshToken = createOpaqueToken();
  const nextHash = hashSecret(refreshToken);
  current.revokedAt = new Date();
  current.replacedByHash = nextHash;
  await current.save();

  const session = await AuthSession.create({
    userId: current.userId,
    familyId: current.familyId,
    refreshTokenHash: nextHash,
    expiresAt: new Date(Date.now() + config.auth.refreshTtlSeconds * 1000),
    userAgent,
    ip,
  });

  return { reuseDetected: false, session, refreshToken };
}

export async function revokeSessionByRefreshToken(refreshToken) {
  if (!refreshToken) {
    return;
  }
  await AuthSession.updateOne(
    { refreshTokenHash: hashSecret(refreshToken), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

export async function revokeUserSessions(userId) {
  await AuthSession.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}
