import { apiRequest } from '../../services/api-client.js';

export const studyRoomApi = {
  access: () => apiRequest('/study-room/access'),
  putPublicKey: (body) => apiRequest('/study-room/crypto/public-key', { method: 'PUT', body: JSON.stringify(body) }),
  claimIdentity: () => apiRequest('/study-room/crypto/identity'),
  getPublicKey: (userId) => apiRequest(`/study-room/crypto/public-keys/${userId}`),
  searchStudents: (q) => apiRequest(`/study-room/students/search?q=${encodeURIComponent(q)}`),
  conversations: () => apiRequest('/study-room/conversations'),
  attention: (resourcesSeenAt) =>
    apiRequest(
      `/study-room/attention${
        resourcesSeenAt ? `?resourcesSeenAt=${encodeURIComponent(resourcesSeenAt)}` : ''
      }`,
    ),
  createConversation: (participantUserId) =>
    apiRequest('/study-room/conversations', { method: 'POST', body: JSON.stringify({ participantUserId }) }),
  getConversation: (id) => apiRequest(`/study-room/conversations/${id}`),
  putEnvelopes: (id, body) =>
    apiRequest(`/study-room/conversations/${id}/key-envelopes`, { method: 'PUT', body: JSON.stringify(body) }),
  messages: (id, before) =>
    apiRequest(`/study-room/conversations/${id}/messages${before ? `?before=${before}` : ''}`),
  sendMessage: (id, body) =>
    apiRequest(`/study-room/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify(body) }),
  editMessage: (id, messageId, body) =>
    apiRequest(`/study-room/conversations/${id}/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  clearConversation: (id) =>
    apiRequest(`/study-room/conversations/${id}/clear`, { method: 'POST', body: JSON.stringify({}) }),
  markRead: (id, lastReadMessageId) =>
    apiRequest(`/study-room/conversations/${id}/read`, { method: 'PATCH', body: JSON.stringify({ lastReadMessageId }) }),
  folders: () => apiRequest('/study-room/folders'),
  createFolder: (body) => apiRequest('/study-room/folders', { method: 'POST', body: JSON.stringify(body) }),
  updateFolder: (id, body) => apiRequest(`/study-room/folders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteFolder: (id) => apiRequest(`/study-room/folders/${id}`, { method: 'DELETE' }),
  folderResources: (folderId) => apiRequest(`/study-room/folders/${folderId}/resources`),
  renameResource: (id, body) =>
    apiRequest(`/study-room/resources/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteResource: (id) => apiRequest(`/study-room/resources/${id}`, { method: 'DELETE' }),
  uploadResource: (folderId, form) =>
    apiRequest(`/study-room/folders/${folderId}/resources`, { method: 'POST', body: form }),
  reportResource: (resourceId, body) =>
    apiRequest(`/study-room/resources/${resourceId}/report`, { method: 'POST', body: JSON.stringify(body) }),
  downloadUrl: (resourceId) => `/api/study-room/resources/${resourceId}/download`,
  moderationSettings: () => apiRequest('/study-room/moderation/settings'),
  updateModerationSettings: (body) =>
    apiRequest('/study-room/moderation/settings', { method: 'PATCH', body: JSON.stringify(body) }),
  moderationQueue: () => apiRequest('/study-room/moderation/resources'),
  approve: (id) => apiRequest(`/study-room/moderation/resources/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }),
  reject: (id) => apiRequest(`/study-room/moderation/resources/${id}/reject`, { method: 'POST', body: JSON.stringify({}) }),
  reports: () => apiRequest('/study-room/moderation/reports'),
};
