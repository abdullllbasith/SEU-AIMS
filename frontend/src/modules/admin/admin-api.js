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

export const adminApi = {
  dashboard: () => apiRequest('/admin/dashboard'),
  students: (params) => apiRequest(`/admin/students${qs(params)}`),
  student: (userId) => apiRequest(`/admin/students/${userId}`),
  setAccountStatus: (userId, accountStatus) =>
    apiRequest(`/auth/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ accountStatus }),
    }),
  setAccountPassword: (userId, password) =>
    apiRequest(`/auth/users/${userId}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password }),
    }),
  lecturers: (params) => apiRequest(`/admin/lecturers${qs(params)}`),
  lecturer: (userId) => apiRequest(`/admin/lecturers/${userId}`),
  offerings: (params) => apiRequest(`/admin/offerings${qs(params)}`),
  resultImports: (params) => apiRequest(`/admin/result-imports${qs(params)}`),
  resultImport: (importId) => apiRequest(`/admin/result-imports/${importId}`),
  caOverview: () => apiRequest('/admin/ca-recovery/overview'),
  caApplications: (params) => apiRequest(`/admin/ca-recovery/applications${qs(params)}`),
  notificationHealth: () => apiRequest('/admin/notifications/health'),
  calendarHealth: () => apiRequest('/admin/calendar/health'),
  jobs: () => apiRequest('/admin/jobs'),
  retryJob: (jobId) => apiRequest(`/admin/jobs/${jobId}/retry`, { method: 'POST', body: JSON.stringify({}) }),
  security: () => apiRequest('/admin/security'),
  dataQuality: () => apiRequest('/admin/data-quality'),
};

export function studentsCsvUrl() {
  return '/api/admin/exports/students.csv';
}
