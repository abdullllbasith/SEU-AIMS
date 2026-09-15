import { Conversation, ConversationKeyEnvelope, Message, MessageReceipt } from '../models/index.js';
import { SharedResource } from '../models/index.js';
import { Notification } from '../../notifications/index.js';
import { CRYPTO_PROTOCOL } from '../constants.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../shared/errors/app-error.js';
import { TooManyRequestsError } from '../../../shared/errors/app-error.js';
import { requireStudentScope, conceal } from './access.service.js';
import { canAccessStudyRoom, canStudentUseConversation } from '../policies/study-room.policies.js';
import { mapConversation, mapMessage } from '../mappers/study-room.mappers.js';
import { isClientMessageId, parseCursor, parseHistoryLimit, participantKey, requireObjectId } from '../utils/http.js';
import { assertRateLimit } from './rate-limit.service.js';
import { StudentAcademicContext } from '../../academic-foundation/index.js';
import { User } from '../../authentication/models/user.model.js';
import { ROLES } from '../../../shared/constants/roles.js';

function assertCipherPayload(body, maxChars) {
  const payload = body?.encryptedPayload;
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('encryptedPayload is required');
  }
  const ciphertext = String(payload.ciphertext || '');
  const nonce = String(payload.nonce || '');
  const keyVersion = String(payload.keyVersion || '1').slice(0, 32);
  const protocolVersion = String(payload.protocolVersion || CRYPTO_PROTOCOL);
  if (!ciphertext || !nonce) {
    throw new ValidationError('Ciphertext and nonce are required');
  }
  if (ciphertext.length > maxChars) {
    throw new ValidationError('Encrypted payload exceeds the size limit');
  }
  if (ciphertext.length < 16 || !/^[A-Za-z0-9+/=_-]+$/.test(ciphertext)) {
    throw new ValidationError('Payload must be ciphertext, not plaintext JSON');
  }
  if (protocolVersion !== CRYPTO_PROTOCOL) {
    throw new ValidationError('Unsupported cryptographic protocol');
  }
  if (/\s/.test(ciphertext) || ciphertext.includes('{')) {
    throw new ValidationError('Payload must be ciphertext, not plaintext JSON');
  }
  return { ciphertext, nonce, keyVersion, protocolVersion };
}

async function loadAuthorizedConversation(principal, conversationId, context) {
  requireObjectId(conversationId, 'conversation');
  const conversation = await Conversation.findById(conversationId);
  if (!conversation || !canStudentUseConversation(conversation, context, principal.userId)) {
    throw conceal('Conversation');
  }
  return conversation;
}

export async function getAccess(principal) {
  if (!canAccessStudyRoom(principal)) {
    throw new ForbiddenError('Study Room is student-only');
  }
  try {
    return await getOverview(principal);
  } catch {
    return { allowed: false, cryptoProtocol: CRYPTO_PROTOCOL };
  }
}

export async function getOverview(principal) {
  const { context, settings } = await requireStudentScope(principal);
  const common = await Conversation.findOneAndUpdate(
    { type: 'BATCH', batchId: context.batchId },
    {
      $setOnInsert: {
        type: 'BATCH',
        departmentId: context.departmentId,
        batchId: context.batchId,
        cryptoProtocol: CRYPTO_PROTOCOL,
        currentKeyVersion: '1',
        createdByUserId: principal.userId,
      },
    },
    { new: true, upsert: true },
  );
  return {
    allowed: true,
    scope: {
      departmentId: String(context.departmentId),
      batchId: String(context.batchId),
      academicYearId: String(context.currentAcademicYearId),
      semesterId: String(context.currentSemesterId),
    },
    moderationMode: settings.moderationMode,
    cryptoProtocol: CRYPTO_PROTOCOL,
    commonConversation: mapConversation(common),
  };
}

export async function listConversations(principal) {
  const { context } = await requireStudentScope(principal);
  const common = await Conversation.findOne({ type: 'BATCH', batchId: context.batchId });
  const privateChats = await Conversation.find({
    type: 'PRIVATE',
    participantUserIds: principal.userId,
    status: 'ACTIVE',
  }).sort({ lastMessageAt: -1, updatedAt: -1 });
  return {
    items: [common, ...privateChats].filter(Boolean).map((item) => mapConversation(item)),
  };
}

export async function createPrivateConversation(principal, body, { config }) {
  const { context } = await requireStudentScope(principal);
  assertRateLimit(
    `sr:conv:${principal.userId}`,
    { max: 20, windowMs: 60_000 },
    TooManyRequestsError,
  );
  requireObjectId(body?.participantUserId, 'participant');
  if (String(body.participantUserId) === String(principal.userId)) {
    throw new ValidationError('Cannot start a private chat with yourself');
  }
  const other = await User.findById(body.participantUserId);
  if (!other || other.role !== ROLES.STUDENT) {
    throw new ForbiddenError('Forbidden');
  }
  const otherContext = await StudentAcademicContext.findOne({
    userId: other._id,
    status: 'ACTIVE',
  });
  if (
    !otherContext ||
    String(otherContext.departmentId) !== String(context.departmentId) ||
    String(otherContext.batchId) !== String(context.batchId)
  ) {
    throw new ForbiddenError('Forbidden');
  }
  const key = participantKey(principal.userId, other._id);
  try {
    const conversation = await Conversation.create({
      type: 'PRIVATE',
      departmentId: context.departmentId,
      participantUserIds: [principal.userId, other._id],
      participantKey: key,
      cryptoProtocol: CRYPTO_PROTOCOL,
      currentKeyVersion: '1',
      createdByUserId: principal.userId,
    });
    return mapConversation(conversation);
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await Conversation.findOne({ participantKey: key });
      return mapConversation(existing);
    }
    throw error;
  }
}

export async function getConversation(principal, conversationId) {
  const { context } = await requireStudentScope(principal);
  const conversation = await loadAuthorizedConversation(principal, conversationId, context);
  const envelopes = await ConversationKeyEnvelope.find({
    conversationId: conversation._id,
    keyVersion: conversation.currentKeyVersion,
  }).select('recipientUserId');
  const have = new Set(envelopes.map((row) => String(row.recipientUserId)));
  let membersMissingEnvelopes = [];
  if (conversation.type === 'BATCH') {
    const members = await StudentAcademicContext.find({
      batchId: conversation.batchId,
      departmentId: conversation.departmentId,
      status: 'ACTIVE',
    }).select('userId');
    membersMissingEnvelopes = members
      .map((row) => String(row.userId))
      .filter((id) => !have.has(id));
  }
  const myEnvelope = await ConversationKeyEnvelope.findOne({
    conversationId: conversation._id,
    recipientUserId: principal.userId,
    keyVersion: conversation.currentKeyVersion,
  });
  return {
    conversation: mapConversation(conversation, {
      membersMissingEnvelopes,
      hasEnvelope: Boolean(myEnvelope),
    }),
    myEnvelope: myEnvelope
      ? {
          wrappedKey: myEnvelope.wrappedKey,
          nonce: myEnvelope.nonce,
          wrappedByUserId: String(myEnvelope.wrappedByUserId),
          keyVersion: myEnvelope.keyVersion,
        }
      : null,
  };
}

export async function putKeyEnvelopes(principal, conversationId, body) {
  const { context } = await requireStudentScope(principal);
  const conversation = await loadAuthorizedConversation(principal, conversationId, context);
  const envelopes = Array.isArray(body?.envelopes) ? body.envelopes.slice(0, 200) : [];
  if (!envelopes.length) {
    throw new ValidationError('envelopes are required');
  }
  const keyVersion = String(body.keyVersion || conversation.currentKeyVersion).slice(0, 32);
  const stored = [];
  for (const item of envelopes) {
    requireObjectId(item.recipientUserId, 'recipient');
    if (!item.wrappedKey || !item.nonce) {
      throw new ValidationError('wrappedKey and nonce are required');
    }
    if (!canStudentUseConversation(conversation, context, item.recipientUserId) && conversation.type === 'PRIVATE') {
      if (!conversation.participantUserIds.some((id) => String(id) === String(item.recipientUserId))) {
        throw new ForbiddenError('Forbidden');
      }
    }
    if (conversation.type === 'BATCH') {
      const recipientContext = await StudentAcademicContext.findOne({
        userId: item.recipientUserId,
        batchId: conversation.batchId,
        departmentId: conversation.departmentId,
        status: 'ACTIVE',
      });
      if (!recipientContext) {
        continue;
      }
    }
    const doc = await ConversationKeyEnvelope.findOneAndUpdate(
      {
        conversationId: conversation._id,
        recipientUserId: item.recipientUserId,
        keyVersion,
      },
      {
        conversationId: conversation._id,
        recipientUserId: item.recipientUserId,
        wrappedByUserId: principal.userId,
        keyVersion,
        wrappedKey: String(item.wrappedKey),
        nonce: String(item.nonce),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    stored.push(String(doc.recipientUserId));
  }
  return { stored };
}

export async function listMessages(principal, conversationId, query, { config }) {
  const { context } = await requireStudentScope(principal);
  const conversation = await loadAuthorizedConversation(principal, conversationId, context);
  const limit = parseHistoryLimit(query, config.studyRoom?.historyPageSize || 50, 30);
  const before = parseCursor(query);
  const filter = { conversationId: conversation._id };
  if (before) {
    const cursorDoc = await Message.findById(before);
    if (cursorDoc && String(cursorDoc.conversationId) === String(conversation._id)) {
      filter.$or = [
        { sentAt: { $lt: cursorDoc.sentAt } },
        { sentAt: cursorDoc.sentAt, _id: { $lt: cursorDoc._id } },
      ];
    }
  }
  const items = await Message.find(filter).sort({ sentAt: -1, _id: -1 }).limit(limit);
  return {
    items: items.map(mapMessage).reverse(),
    nextCursor: items.length === limit ? String(items[items.length - 1]._id) : null,
  };
}

export async function sendMessage(principal, conversationId, body, { config }) {
  const { context } = await requireStudentScope(principal);
  assertRateLimit(
    `sr:msg:${principal.userId}`,
    { max: config.studyRoom?.messageMaxPerMinute || 60, windowMs: 60_000 },
    TooManyRequestsError,
  );
  const conversation = await loadAuthorizedConversation(principal, conversationId, context);
  if (!isClientMessageId(body?.clientMessageId)) {
    throw new ValidationError('clientMessageId is required');
  }
  const encryptedPayload = assertCipherPayload(body, config.studyRoom?.ciphertextMaxChars || 16_000);
  let sharedResourceId;
  if (body.sharedResourceId) {
    requireObjectId(body.sharedResourceId, 'resource');
    const resource = await SharedResource.findById(body.sharedResourceId);
    if (
      !resource ||
      resource.deletedAt ||
      String(resource.batchId) !== String(context.batchId) ||
      resource.moderationState !== 'AVAILABLE'
    ) {
      throw new ValidationError('Shared resource is not available to attach');
    }
    sharedResourceId = resource._id;
  }

  try {
    const message = await Message.create({
      conversationId: conversation._id,
      senderUserId: principal.userId,
      clientMessageId: body.clientMessageId,
      encryptedPayload,
      sharedResourceId,
      sentAt: new Date(),
    });
    conversation.lastMessageAt = message.sentAt;
    await conversation.save();
    await notifyNewMessage(conversation, message, principal.userId);
    return { message: mapMessage(message), duplicate: false };
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await Message.findOne({
        conversationId: conversation._id,
        senderUserId: principal.userId,
        clientMessageId: body.clientMessageId,
      });
      return { message: mapMessage(existing), duplicate: true };
    }
    throw error;
  }
}

async function notifyNewMessage(conversation, message, senderUserId) {
  let recipientIds = [];
  if (conversation.type === 'PRIVATE') {
    recipientIds = conversation.participantUserIds
      .map((id) => String(id))
      .filter((id) => id !== String(senderUserId));
  } else {
    const members = await StudentAcademicContext.find({
      batchId: conversation.batchId,
      departmentId: conversation.departmentId,
      status: 'ACTIVE',
      userId: { $ne: senderUserId },
    })
      .select('userId')
      .limit(2000);
    recipientIds = members.map((row) => String(row.userId));
  }
  if (!recipientIds.length) {
    return;
  }
  const docs = recipientIds.map((id) => ({
    recipientUserId: id,
    type: 'STUDY_ROOM_NEW_MESSAGE',
    sourceModule: 'study-room',
    sourceId: String(message._id),
    channel: 'IN_APP',
    status: 'PENDING',
    idempotencyKey: `study-room:msg:${message._id}:${id}`,
  }));
  try {
    await Notification.insertMany(docs, { ordered: false });
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }
  }
}

export async function markRead(principal, conversationId, body) {
  const { context } = await requireStudentScope(principal);
  const conversation = await loadAuthorizedConversation(principal, conversationId, context);
  requireObjectId(body?.lastReadMessageId, 'message');
  const message = await Message.findById(body.lastReadMessageId);
  if (!message || String(message.conversationId) !== String(conversation._id)) {
    throw new NotFoundError('Message not found');
  }
  const receipt = await MessageReceipt.findOneAndUpdate(
    { conversationId: conversation._id, userId: principal.userId },
    {
      conversationId: conversation._id,
      userId: principal.userId,
      lastReadMessageId: message._id,
      lastReadAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return { lastReadMessageId: String(receipt.lastReadMessageId), lastReadAt: receipt.lastReadAt };
}

export async function tombstoneMessage(principal, conversationId, messageId) {
  const { context } = await requireStudentScope(principal);
  const conversation = await loadAuthorizedConversation(principal, conversationId, context);
  requireObjectId(messageId, 'message');
  const message = await Message.findById(messageId);
  if (!message || String(message.conversationId) !== String(conversation._id)) {
    throw conceal('Message');
  }
  if (String(message.senderUserId) !== String(principal.userId)) {
    throw new ForbiddenError('Forbidden');
  }
  message.deletedAt = new Date();
  await message.save();
  return mapMessage(message);
}

export async function editMessage(principal, conversationId, messageId, body, { config }) {
  const { context } = await requireStudentScope(principal);
  const conversation = await loadAuthorizedConversation(principal, conversationId, context);
  requireObjectId(messageId, 'message');
  const message = await Message.findById(messageId);
  if (!message || String(message.conversationId) !== String(conversation._id)) {
    throw conceal('Message');
  }
  if (String(message.senderUserId) !== String(principal.userId) || message.deletedAt) {
    throw new ForbiddenError('Forbidden');
  }
  message.encryptedPayload = assertCipherPayload(body, config.studyRoom?.ciphertextMaxChars || 16_000);
  message.editedAt = new Date();
  await message.save();
  return mapMessage(message);
}

export function socketRoomName(conversationId) {
  return `study-room:${conversationId}`;
}

export { loadAuthorizedConversation };
