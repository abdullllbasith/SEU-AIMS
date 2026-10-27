import { CryptoPublicKey } from '../models/index.js';
import { generateIdentityJwk } from './identity-key.js';
import { User } from '../../authentication/models/user.model.js';
import { StudentAcademicContext } from '../../academic-foundation/index.js';
import { ValidationError, ForbiddenError } from '../../../shared/errors/app-error.js';
import { ROLES } from '../../../shared/constants/roles.js';
import { CRYPTO_PROTOCOL } from '../constants.js';
import { requireStudentScope } from './access.service.js';
import { mapStudentPeer } from '../mappers/study-room.mappers.js';
import { escapeRegex, requireObjectId } from '../utils/http.js';
import { assertRateLimit } from './rate-limit.service.js';
import { TooManyRequestsError } from '../../../shared/errors/app-error.js';

function isPublicKeyJwk(value) {
  return (
    value &&
    typeof value === 'object' &&
    value.kty === 'EC' &&
    value.crv === 'P-256' &&
    typeof value.x === 'string' &&
    typeof value.y === 'string' &&
    value.d === undefined
  );
}

async function ensureIdentityKey(userId) {
  const existing = await CryptoPublicKey.findOne({ userId });
  if (existing) {
    return existing;
  }
  const created = generateIdentityJwk();
  try {
    return await CryptoPublicKey.create({
      userId,
      algorithm: 'ECDH-P256',
      protocolVersion: CRYPTO_PROTOCOL,
      publicKeyJwk: created.publicKeyJwk,
      recoveryPrivateJwk: created.privateKeyJwk,
      keyVersion: '1',
    });
  } catch (error) {
    if (error?.code === 11000) {
      return CryptoPublicKey.findOne({ userId });
    }
    throw error;
  }
}

export async function upsertPublicKey(principal, body, { config }) {
  await requireStudentScope(principal);
  if (!isPublicKeyJwk(body?.publicKeyJwk)) {
    throw new ValidationError('A P-256 ECDH public JWK is required');
  }
  const keyVersion = String(body.keyVersion || '1').slice(0, 32);
  const existing = await CryptoPublicKey.findOne({ userId: principal.userId });
  const sameKey = existing?.publicKeyJwk?.x === body.publicKeyJwk.x && existing?.publicKeyJwk?.y === body.publicKeyJwk.y;
  const update = {
    $set: {
      userId: principal.userId,
      algorithm: 'ECDH-P256',
      protocolVersion: CRYPTO_PROTOCOL,
      publicKeyJwk: {
        kty: body.publicKeyJwk.kty,
        crv: body.publicKeyJwk.crv,
        x: body.publicKeyJwk.x,
        y: body.publicKeyJwk.y,
      },
      keyVersion,
    },
  };
  if (!sameKey) {
    update.$unset = { recoveryPrivateJwk: '' };
  }
  const doc = await CryptoPublicKey.findOneAndUpdate(
    { userId: principal.userId },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return {
    userId: String(doc.userId),
    algorithm: doc.algorithm,
    protocolVersion: doc.protocolVersion,
    publicKeyJwk: doc.publicKeyJwk,
    keyVersion: doc.keyVersion,
  };
}

export async function getPublicKey(principal, userId, { config }) {
  const { context } = await requireStudentScope(principal);
  requireObjectId(userId, 'user');
  const target = await User.findById(userId);
  if (!target || target.role !== ROLES.STUDENT) {
    throw new ForbiddenError('Forbidden');
  }
  const targetContext = await StudentAcademicContext.findOne({
    userId: target._id,
    status: 'ACTIVE',
  });
  if (
    !targetContext ||
    String(targetContext.departmentId) !== String(context.departmentId) ||
    String(targetContext.batchId) !== String(context.batchId)
  ) {
    throw new ForbiddenError('Forbidden');
  }
  const doc = await ensureIdentityKey(target._id);
  return {
    userId: String(doc.userId),
    publicKeyJwk: doc.publicKeyJwk,
    keyVersion: doc.keyVersion,
    protocolVersion: doc.protocolVersion,
  };
}

/** The signed-in student can recover the key created so classmates could message them first. */
export async function claimIdentity(principal) {
  await requireStudentScope(principal);
  const doc = await ensureIdentityKey(principal.userId);
  const matches =
    doc.recoveryPrivateJwk &&
    doc.recoveryPrivateJwk.x === doc.publicKeyJwk?.x &&
    doc.recoveryPrivateJwk.y === doc.publicKeyJwk?.y;
  return {
    userId: String(doc.userId),
    publicKeyJwk: doc.publicKeyJwk,
    privateKeyJwk: matches ? doc.recoveryPrivateJwk : null,
    keyVersion: doc.keyVersion,
  };
}

export async function searchStudents(principal, query, { config }) {
  const { context } = await requireStudentScope(principal);
  assertRateLimit(
    `sr:search:${principal.userId}`,
    { max: config.studyRoom?.searchMaxPerMinute || 30, windowMs: 60_000 },
    TooManyRequestsError,
  );
  const q = String(query.q || '').trim();
  if (q.length < 2) {
    throw new ValidationError('Search requires at least two characters');
  }
  const peers = await StudentAcademicContext.find({
    departmentId: context.departmentId,
    batchId: context.batchId,
    status: 'ACTIVE',
    userId: { $ne: principal.userId },
    registrationNumber: new RegExp(escapeRegex(q), 'i'),
  }).limit(20);

  const named = await User.find({
    role: ROLES.STUDENT,
    _id: { $ne: principal.userId },
    displayName: new RegExp(escapeRegex(q), 'i'),
  }).limit(20);

  const namedContexts = await StudentAcademicContext.find({
    userId: { $in: named.map((user) => user._id) },
    departmentId: context.departmentId,
    batchId: context.batchId,
    status: 'ACTIVE',
  });

  const byUserId = new Map();
  for (const row of peers) {
    byUserId.set(String(row.userId), row);
  }
  for (const row of namedContexts) {
    byUserId.set(String(row.userId), row);
  }

  const users = await User.find({ _id: { $in: [...byUserId.keys()] }, role: ROLES.STUDENT });
  return {
    items: users.map((user) => mapStudentPeer(user, byUserId.get(String(user._id)))),
  };
}
