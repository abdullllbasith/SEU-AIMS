export function mapConversation(conversation, extras = {}) {
  return {
    id: String(conversation._id),
    type: conversation.type,
    batchId: conversation.batchId ? String(conversation.batchId) : null,
    participantUserIds: (conversation.participantUserIds || []).map((id) => String(id)),
    cryptoProtocol: conversation.cryptoProtocol,
    currentKeyVersion: conversation.currentKeyVersion,
    lastMessageAt: conversation.lastMessageAt || null,
    ...extras,
  };
}

export function mapMessage(message, extras = {}) {
  return {
    id: String(message._id),
    conversationId: String(message.conversationId),
    senderUserId: String(message.senderUserId),
    senderDisplayName: extras.senderDisplayName || null,
    clientMessageId: message.clientMessageId,
    encryptedPayload: {
      ciphertext: message.encryptedPayload.ciphertext,
      nonce: message.encryptedPayload.nonce,
      keyVersion: message.encryptedPayload.keyVersion,
      protocolVersion: message.encryptedPayload.protocolVersion,
    },
    sharedResourceId: message.sharedResourceId ? String(message.sharedResourceId) : null,
    deletedAt: message.deletedAt || null,
    editedAt: message.editedAt || null,
    sentAt: message.sentAt,
    createdAt: message.sentAt,
    readByPeer: extras.readByPeer === true,
  };
}

export function mapFolder(folder) {
  return {
    id: String(folder._id),
    name: folder.name,
    description: folder.description || '',
    visibility: folder.visibility,
    createdByUserId: String(folder.createdByUserId),
    createdAt: folder.createdAt,
  };
}

export function mapResource(resource, { file, includeOperational = false } = {}) {
  const payload = {
    id: String(resource._id),
    folderId: String(resource.folderId),
    title: resource.title || file?.displayFilename || 'Shared file',
    displayFilename: file?.displayFilename || resource.title || 'file',
    mimeType: file?.mimeType || null,
    sizeBytes: file?.sizeBytes || null,
    createdByUserId: String(resource.createdByUserId),
    studentStatus: resource.moderationState,
    createdAt: resource.createdAt,
  };
  if (includeOperational) {
    payload.moderationState = resource.moderationState;
    payload.scanStatus = file?.scanStatus || null;
    payload.reviewStatus = resource.reviewStatus;
    payload.fileId = String(resource.fileId);
  }
  return payload;
}

export function mapStudentPeer(user, context) {
  return {
    id: String(user._id),
    displayName: user.displayName || user.email,
    registrationNumber: context?.registrationNumber || null,
  };
}
