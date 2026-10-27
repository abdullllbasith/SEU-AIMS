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
  const peerIds = privateChats
    .map((chat) => chat.participantUserIds.find((id) => String(id) !== String(principal.userId)))
    .filter(Boolean);
  const [users, contexts, recentMessages] = await Promise.all([
    peerIds.length ? User.find({ _id: { $in: peerIds } }).select('displayName') : [],
    peerIds.length
      ? StudentAcademicContext.find({ userId: { $in: peerIds }, status: 'ACTIVE' }).select('userId registrationNumber')
      : [],
    privateChats.length
      ? Message.find({
          conversationId: { $in: privateChats.map((chat) => chat._id) },
          deletedAt: null,
        })
          .sort({ sentAt: -1 })
          .select('conversationId senderUserId encryptedPayload sentAt')
      : [],
  ]);
  const unreadCounts = await countUnreadByConversation(
    principal.userId,
    privateChats.map((chat) => chat._id),
  );
  const names = new Map(users.map((user) => [String(user._id), user.displayName || '']));
  const registrations = new Map(contexts.map((row) => [String(row.userId), row.registrationNumber || '']));
  const latestByConversation = new Map();
  for (const message of recentMessages) {
    const key = String(message.conversationId);
    if (!latestByConversation.has(key)) {
      latestByConversation.set(key, message);
    }
  }
  return {
    items: [
      common ? mapConversation(common) : null,
      ...privateChats.map((chat) => {
        const peerId = chat.participantUserIds.find((id) => String(id) !== String(principal.userId));
        const latest = latestByConversation.get(String(chat._id));
        return mapConversation(chat, {
          peer: peerId
            ? {
                id: String(peerId),
                displayName: names.get(String(peerId)) || 'Classmate',
                registrationNumber: registrations.get(String(peerId)) || '',
              }
            : null,
          lastMessage: latest
            ? {
                id: String(latest._id),
                senderUserId: String(latest.senderUserId),
                encryptedPayload: latest.encryptedPayload,
                sentAt: latest.sentAt,
              }
            : null,
          unreadCount: unreadCounts.get(String(chat._id)) || 0,
        });
      }),
    ].filter(Boolean),
  };
}

const RESOURCE_ATTENTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function countUnreadByConversation(userId, conversationIds) {
  const counts = new Map(conversationIds.map((id) => [String(id), 0]));
  if (!conversationIds.length) {
    return counts;
  }
  const receipts = await MessageReceipt.find({
    userId,
    conversationId: { $in: conversationIds },
  }).select('conversationId lastReadMessageId');
  const anchorIds = receipts.map((row) => row.lastReadMessageId).filter(Boolean);
  const anchors = anchorIds.length ? await Message.find({ _id: { $in: anchorIds } }).select('sentAt') : [];
  const anchorById = new Map(anchors.map((row) => [String(row._id), row]));
  const receiptByConversation = new Map(receipts.map((row) => [String(row.conversationId), row]));
  await Promise.all(
    conversationIds.map(async (id) => {
      const receipt = receiptByConversation.get(String(id));
      const anchor = receipt?.lastReadMessageId ? anchorById.get(String(receipt.lastReadMessageId)) : null;
      counts.set(String(id), await Message.countDocuments(unreadFilter(id, userId, anchor)));
    }),
  );
  return counts;
}

function unreadFilter(conversationId, userId, anchor) {
  const filter = {
    conversationId,
    senderUserId: { $ne: userId },
    deletedAt: null,
  };
  if (anchor?.sentAt) {
    filter.$or = [
      { sentAt: { $gt: anchor.sentAt } },
      { sentAt: anchor.sentAt, _id: { $gt: anchor._id } },
    ];
  }
  return filter;
}

export async function attentionCounts(principal, query = {}) {
  const { context } = await requireStudentScope(principal);
  const conversations = await Conversation.find({
    $or: [
      { type: 'BATCH', batchId: context.batchId, departmentId: context.departmentId },
      { type: 'PRIVATE', participantUserIds: principal.userId, status: 'ACTIVE' },
    ],
  }).select('type');
  const receipts = conversations.length
    ? await MessageReceipt.find({
        userId: principal.userId,
        conversationId: { $in: conversations.map((row) => row._id) },
      }).select('conversationId lastReadMessageId')
    : [];
  const anchorIds = receipts.map((row) => row.lastReadMessageId).filter(Boolean);
  const anchors = anchorIds.length ? await Message.find({ _id: { $in: anchorIds } }).select('sentAt') : [];
  const anchorById = new Map(anchors.map((row) => [String(row._id), row]));
  const receiptByConversation = new Map(receipts.map((row) => [String(row.conversationId), row]));
  let common = 0;
  let privateCount = 0;
  await Promise.all(
    conversations.map(async (conversation) => {
      const receipt = receiptByConversation.get(String(conversation._id));
      const anchor = receipt?.lastReadMessageId
        ? anchorById.get(String(receipt.lastReadMessageId))
        : null;
      const count = await Message.countDocuments(unreadFilter(conversation._id, principal.userId, anchor));
      if (conversation.type === 'BATCH') {
        common += count;
      } else {
        privateCount += count;
      }
    }),
  );
  const seenRaw = String(query.resourcesSeenAt || '').trim();
  const seen = seenRaw ? new Date(seenRaw) : null;
  const seenAt = seen && !Number.isNaN(seen.getTime()) ? seen : new Date(Date.now() - RESOURCE_ATTENTION_WINDOW_MS);
  const resources = await SharedResource.countDocuments({
    departmentId: context.departmentId,
    batchId: context.batchId,
    moderationState: 'AVAILABLE',
    createdByUserId: { $ne: principal.userId },
    deletedAt: null,
    updatedAt: { $gt: seenAt },
  });
  return {
    common,
    private: privateCount,
    resources,
    total: common + privateCount + resources,
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
      const existing = await Conversation.findOne({ type: 'PRIVATE', participantKey: key });
      if (existing) {
        return mapConversation(existing);
      }
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
  let batchMemberUserIds = [];
  let membersMissingEnvelopes = [];
  if (conversation.type === 'BATCH') {
    const members = await StudentAcademicContext.find({
      batchId: conversation.batchId,
      departmentId: conversation.departmentId,
      status: 'ACTIVE',
    }).select('userId');
    batchMemberUserIds = members.map((row) => String(row.userId));
    membersMissingEnvelopes = batchMemberUserIds.filter((id) => !have.has(id));
  }
  const myEnvelope = await ConversationKeyEnvelope.findOne({
    conversationId: conversation._id,
    recipientUserId: principal.userId,
    keyVersion: conversation.currentKeyVersion,
  });
  const oldestEnvelope = await ConversationKeyEnvelope.findOne({
    conversationId: conversation._id,
    keyVersion: conversation.currentKeyVersion,
  }).sort({ createdAt: 1, _id: 1 });
  const keyOwnerUserId = oldestEnvelope ? String(oldestEnvelope.recipientUserId) : null;
  const allEnvelopes =
    conversation.type === 'BATCH'
      ? await ConversationKeyEnvelope.find({
          conversationId: conversation._id,
          keyVersion: conversation.currentKeyVersion,
        }).select('recipientUserId wrappedByUserId wrappedKey nonce previousWraps')
      : [];
  return {
    conversation: mapConversation(conversation, {
      membersMissingEnvelopes,
      batchMemberUserIds,
      hasEnvelope: Boolean(myEnvelope),
      keyOwnerUserId,
      keyAuthorityUserId: keyOwnerUserId,
    }),
    myEnvelope: myEnvelope ? mapEnvelope(myEnvelope) : null,
    batchEnvelopes: allEnvelopes.map(mapEnvelope),
  };
}

function mapEnvelope(envelope) {
  return {
    recipientUserId: String(envelope.recipientUserId),
    wrappedKey: envelope.wrappedKey,
    nonce: envelope.nonce,
    wrappedByUserId: String(envelope.wrappedByUserId),
    keyVersion: envelope.keyVersion,
    previousWraps: (envelope.previousWraps || []).map((item) => ({
      wrappedKey: item.wrappedKey,
      nonce: item.nonce,
      wrappedByUserId: String(item.wrappedByUserId),
    })),
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
  const sync = body?.sync === true;
  if (sync && conversation.type === 'BATCH') {
    const oldestEnvelope = await ConversationKeyEnvelope.findOne({
      conversationId: conversation._id,
      keyVersion,
    }).sort({ createdAt: 1, _id: 1 });
    if (!oldestEnvelope || String(oldestEnvelope.recipientUserId) !== String(principal.userId)) {
      throw new ForbiddenError('Only the chat key owner can sync the batch key');
    }
  }
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
    const existing = await ConversationKeyEnvelope.findOne({
      conversationId: conversation._id,
      recipientUserId: item.recipientUserId,
      keyVersion,
    });
    if (existing) {
      const sameWrap =
        existing.wrappedKey === String(item.wrappedKey) && existing.nonce === String(item.nonce);
      if (!sync || sameWrap || String(existing.recipientUserId) === String(principal.userId)) {
        continue;
      }
      existing.previousWraps = existing.previousWraps || [];
      existing.previousWraps.push({
        wrappedKey: existing.wrappedKey,
        nonce: existing.nonce,
        wrappedByUserId: existing.wrappedByUserId,
      });
      existing.wrappedKey = String(item.wrappedKey);
      existing.nonce = String(item.nonce);
      existing.wrappedByUserId = principal.userId;
      await existing.save();
      stored.push(String(existing.recipientUserId));
      continue;
    }
    try {
      const doc = await ConversationKeyEnvelope.create({
        conversationId: conversation._id,
        recipientUserId: item.recipientUserId,
        wrappedByUserId: principal.userId,
        keyVersion,
        wrappedKey: String(item.wrappedKey),
        nonce: String(item.nonce),
      });
      stored.push(String(doc.recipientUserId));
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
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
  const names = await senderNames(items.map((item) => item.senderUserId));
  let readAnchor = null;
  if (conversation.type === 'PRIVATE') {
    const peerId = (conversation.participantUserIds || []).find(
      (id) => String(id) !== String(principal.userId),
    );
    if (peerId) {
      const receipt = await MessageReceipt.findOne({
        conversationId: conversation._id,
        userId: peerId,
      }).select('lastReadMessageId');
      if (receipt?.lastReadMessageId) {
        readAnchor = await Message.findById(receipt.lastReadMessageId).select('sentAt _id');
      }
    }
  }
  return {
    items: items
      .map((item) =>
        mapMessage(item, {
          senderDisplayName: names.get(String(item.senderUserId)) || null,
          readByPeer:
            String(item.senderUserId) === String(principal.userId) && messageReadAtOrBefore(item, readAnchor),
        }),
      )
      .reverse(),
    nextCursor: items.length === limit ? String(items[items.length - 1]._id) : null,
  };
}

function messageReadAtOrBefore(message, anchor) {
  if (!anchor) {
    return false;
  }
  const sentAt = new Date(message.sentAt).getTime();
  const anchorAt = new Date(anchor.sentAt).getTime();
  if (sentAt < anchorAt) {
    return true;
  }
  if (sentAt > anchorAt) {
    return false;
  }
  return String(message._id) <= String(anchor._id);
}

async function senderNames(userIds) {
  const ids = [...new Set(userIds.map((id) => String(id)).filter(Boolean))];
  if (!ids.length) {
    return new Map();
  }
  const users = await User.find({ _id: { $in: ids } }).select('displayName');
  return new Map(users.map((user) => [String(user._id), user.displayName || '']));
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
    const names = await senderNames([principal.userId]);
    const mapped = mapMessage(message, {
      senderDisplayName: names.get(String(principal.userId)) || null,
    });
    return {
      message: mapped,
      duplicate: false,
      delivery: deliveryMeta(conversation, message.sentAt),
    };
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await Message.findOne({
        conversationId: conversation._id,
        senderUserId: principal.userId,
        clientMessageId: body.clientMessageId,
      });
      return {
        message: mapMessage(existing),
        duplicate: true,
        delivery: deliveryMeta(conversation, existing?.sentAt),
      };
    }
    throw error;
  }
}

function deliveryMeta(conversation, sentAt) {
  return {
    conversationId: String(conversation._id),
    participantUserIds:
      conversation.type === 'PRIVATE' ? (conversation.participantUserIds || []).map((id) => String(id)) : [],
    lastMessageAt: sentAt || null,
  };
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
  const sender = await User.findById(senderUserId).select('displayName');
  const senderName = sender?.displayName || 'A classmate';
  const conversationId = String(conversation._id);
  const isPrivate = conversation.type === 'PRIVATE';
  const title = isPrivate ? senderName : 'Common batch chat';
  const body = isPrivate
    ? `New private message from ${senderName}`
    : `${senderName} sent a message in your batch chat`;
  const actionPath = isPrivate
    ? `/study-room?tab=private&conversation=${conversationId}`
    : '/study-room?tab=common';
  const docs = recipientIds.map((id) => ({
    recipientUserId: id,
    type: 'STUDY_ROOM_NEW_MESSAGE',
    sourceModule: 'study-room',
    sourceId: String(message._id),
    channel: 'IN_APP',
    status: 'PENDING',
    title,
    body,
    actionPath,
    category: 'system',
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

export function userRoomName(userId) {
  return `study-room:user:${userId}`;
}

export function publishChatMessage(io, result) {
  if (!io || !result?.message) {
    return;
  }
  const conversationId = result.message.conversationId;
  io.to(socketRoomName(conversationId)).emit('study-room:message:new', result.message);
  for (const userId of result.delivery?.participantUserIds || []) {
    io.to(userRoomName(userId)).emit('study-room:inbox', {
      conversationId,
      lastMessageAt: result.delivery.lastMessageAt,
      message: result.message,
    });
  }
}

export function publishChatRead(io, conversationId, userId, receipt) {
  if (!io || !receipt?.lastReadMessageId) {
    return;
  }
  io.to(socketRoomName(conversationId)).emit('study-room:read', {
    conversationId: String(conversationId),
    userId: String(userId),
    lastReadMessageId: receipt.lastReadMessageId,
    lastReadAt: receipt.lastReadAt,
  });
}

export { loadAuthorizedConversation };
