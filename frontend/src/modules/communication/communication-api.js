import { apiRequest } from '../../services/api-client.js';

export const communicationApi = {
  notifications: (params = '') => apiRequest(`/notifications${params}`),
  unread: () => apiRequest('/notifications/unread-count'),
  markRead: (id) => apiRequest(`/notifications/${id}/read`, { method: 'PATCH', body: JSON.stringify({}) }),
  markAllRead: () => apiRequest('/notifications/mark-all-read', { method: 'POST', body: JSON.stringify({}) }),
  preferences: () => apiRequest('/notifications/preferences'),
  savePreferences: (body) => apiRequest('/notifications/preferences', { method: 'PATCH', body: JSON.stringify(body) }),
  communicationChecks: () => apiRequest('/calendar/admin/reconciliation'),
  notices: () => apiRequest('/notices'),
  notice: (id) => apiRequest(`/notices/${id}`),
  adminCreateNotice: (body) => apiRequest('/notices/admin', { method: 'POST', body: JSON.stringify(body) }),
  uploadNoticeImage: (id, formData) =>
    apiRequest(`/notices/admin/${id}/images`, { method: 'POST', body: formData }),
  removeNoticeImage: (id, imageId) => apiRequest(`/notices/admin/${id}/images/${imageId}`, { method: 'DELETE' }),
  reorderNoticeImages: (id, imageIds) =>
    apiRequest(`/notices/admin/${id}/images`, { method: 'PATCH', body: JSON.stringify({ imageIds }) }),
  updateNotice: (id, body) => apiRequest(`/notices/admin/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  publishNotice: (id) => apiRequest(`/notices/admin/${id}/publish`, { method: 'POST', body: JSON.stringify({}) }),
  archiveNotice: (id) => apiRequest(`/notices/admin/${id}/archive`, { method: 'POST', body: JSON.stringify({}) }),
  events: (params = '') => apiRequest(`/calendar/events${params}`),
  upcoming: () => apiRequest('/calendar/upcoming'),
  event: (id) => apiRequest(`/calendar/events/${id}`),
  adminCreateEvent: (body) => apiRequest('/calendar/admin/events', { method: 'POST', body: JSON.stringify(body) }),
  cancelAdminEvent: (id) => apiRequest(`/calendar/admin/events/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) }),
  lecturerCreateEvent: (body) => apiRequest('/calendar/lecturer/events', { method: 'POST', body: JSON.stringify(body) }),
};
