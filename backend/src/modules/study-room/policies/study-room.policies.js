import { ROLES } from '../../../shared/constants/roles.js';
import { RESOURCE_STATES } from '../constants.js';

export function canAccessStudyRoom(principal) {
  return Boolean(principal && principal.role === ROLES.STUDENT);
}

export function canModerateStudyRoom(principal, departmentId) {
  if (!principal || principal.role !== ROLES.DEPARTMENT_ADMINISTRATOR) {
    return false;
  }
  if (!departmentId || !principal.departmentId) {
    return false;
  }
  return String(principal.departmentId) === String(departmentId);
}

export function isSameBatchScope(context, batchId, departmentId) {
  if (!context || context.status !== 'ACTIVE') {
    return false;
  }
  return (
    String(context.batchId) === String(batchId) &&
    String(context.departmentId) === String(departmentId)
  );
}

export function isPrivateParticipant(conversation, userId) {
  return (conversation.participantUserIds || []).some((id) => String(id) === String(userId));
}

export function canStudentUseConversation(conversation, context, userId) {
  if (!conversation || conversation.status !== 'ACTIVE') {
    return false;
  }
  if (conversation.type === 'BATCH') {
    return isSameBatchScope(context, conversation.batchId, conversation.departmentId);
  }
  if (conversation.type === 'PRIVATE') {
    return isPrivateParticipant(conversation, userId);
  }
  return false;
}

export function canManageSharedItem(item) {
  return Boolean(item && !item.deletedAt);
}

export function isStudentDownloadable(resource, file) {
  return (
    resource &&
    !resource.deletedAt &&
    resource.moderationState === 'AVAILABLE' &&
    file &&
    file.scanStatus === 'SAFE' &&
    file.availability === 'AVAILABLE'
  );
}

const ALLOWED_TRANSITIONS = {
  UPLOADING: ['QUARANTINED', 'SCANNING'],
  QUARANTINED: ['SCANNING', 'SCAN_FAILED', 'PENDING_REVIEW', 'AVAILABLE'],
  SCANNING: ['PENDING_REVIEW', 'AVAILABLE', 'SCAN_FAILED', 'QUARANTINED'],
  PENDING_REVIEW: ['AVAILABLE', 'REJECTED', 'REMOVED'],
  AVAILABLE: ['REMOVED'],
  REJECTED: ['REMOVED'],
  SCAN_FAILED: ['REMOVED', 'SCANNING'],
  REMOVED: [],
};

export function canTransitionResource(from, to) {
  return Boolean(ALLOWED_TRANSITIONS[from]?.includes(to)) && RESOURCE_STATES.includes(to);
}

export function studentStatusLabel(moderationState) {
  switch (moderationState) {
    case 'UPLOADING':
    case 'QUARANTINED':
    case 'SCANNING':
      return 'Security check in progress…';
    case 'PENDING_REVIEW':
      return 'Waiting for approval…';
    case 'AVAILABLE':
      return 'Available';
    case 'REJECTED':
    case 'REMOVED':
      return 'Not available';
    case 'SCAN_FAILED':
      return 'Not available';
    default:
      return 'Processing…';
  }
}
