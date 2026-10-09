import { apiRequest } from '../../services/api-client.js';

const qs = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  });
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
};

export const caApi = {
  conditions: (params) => apiRequest(`/ca/conditions${qs(params)}`),
  windowsMe: (params) => apiRequest(`/ca/windows/me${qs(params)}`),
  applications: () => apiRequest('/ca/applications'),
  create: (body) => apiRequest('/ca/applications', { method: 'POST', body: JSON.stringify(body) }),
  get: (id) => apiRequest(`/ca/applications/${id}`),
  submit: (id) => apiRequest(`/ca/applications/${id}/submit`, { method: 'POST', body: JSON.stringify({}) }),
  pdfUrl: (id) => `/api/ca/applications/${id}/pdf`,
  adminWindows: () => apiRequest('/ca/admin/windows'),
  saveWindow: (body) => apiRequest('/ca/admin/windows', { method: 'POST', body: JSON.stringify(body) }),
  adminApplications: (params) => apiRequest(`/ca/admin/applications${qs(params)}`),
  verify: (id, body) =>
    apiRequest(`/ca/admin/applications/${id}/verify`, { method: 'POST', body: JSON.stringify(body) }),
  approve: (id) => apiRequest(`/ca/admin/applications/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }),
  reject: (id, body) =>
    apiRequest(`/ca/admin/applications/${id}/reject`, { method: 'POST', body: JSON.stringify(body) }),
  reopen: (id, body) =>
    apiRequest(`/ca/admin/applications/${id}/reopen`, { method: 'POST', body: JSON.stringify(body) }),
  reconciliation: () => apiRequest('/ca/admin/reconciliation'),
  backfill: () => apiRequest('/ca/admin/backfill', { method: 'POST', body: JSON.stringify({}) }),
  lecturerEligible: () => apiRequest('/ca/lecturer/eligible-students'),
  lecturerSchedules: () => apiRequest('/ca/lecturer/schedules'),
  createSchedule: (body) => apiRequest('/ca/lecturer/schedules', { method: 'POST', body: JSON.stringify(body) }),
  cancelSchedule: (id) =>
    apiRequest(`/ca/lecturer/schedules/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) }),
  complete: (id) =>
    apiRequest(`/ca/lecturer/applications/${id}/complete`, { method: 'POST', body: JSON.stringify({}) }),
};
