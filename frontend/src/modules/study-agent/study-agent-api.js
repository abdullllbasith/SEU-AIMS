import { apiRequest, uploadWithProgress } from '../../services/api-client.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export const studyAgentApi = {
  access: () => apiRequest('/study-agent/access'),
  subjects: () => apiRequest('/study-agent/subjects'),
  sessions: ({ resumable = false } = {}) =>
    apiRequest(`/study-agent/sessions${resumable ? '?resumable=true' : ''}`),
  createSession: (body) => apiRequest('/study-agent/sessions', { method: 'POST', body: JSON.stringify(body) }),
  session: (id, before) =>
    apiRequest(`/study-agent/sessions/${id}${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  archiveSession: (id) => apiRequest(`/study-agent/sessions/${id}`, { method: 'DELETE' }),
  /** payload: { content, intent?, attachmentIds? } */
  sendMessage: (id, payload) =>
    apiRequest(`/study-agent/sessions/${id}/messages`, { method: 'POST', body: JSON.stringify(payload) }),
  uploadAttachments: (id, formData, onProgress) =>
    uploadWithProgress(`/study-agent/sessions/${id}/attachments`, formData, { onProgress }),
  attachmentStatus: (fileId) => apiRequest(`/study-agent/attachments/${fileId}`),
  removeAttachment: (fileId) => apiRequest(`/study-agent/attachments/${fileId}`, { method: 'DELETE' }),
  /** Owner-only; works as an <img src> because the session cookie travels with same-site requests. */
  attachmentContentUrl: (fileId) => `${API_BASE}/study-agent/attachments/${fileId}/content`,
};
