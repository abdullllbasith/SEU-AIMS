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
  preview: (params) => apiRequest(`/ca/applications/preview${qs(params)}`),
  create: (body) => apiRequest('/ca/applications', { method: 'POST', body: JSON.stringify(body) }),
  get: (id) => apiRequest(`/ca/applications/${id}`),
  update: (id, body) => apiRequest(`/ca/applications/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  submit: (id) => apiRequest(`/ca/applications/${id}/submit`, { method: 'POST', body: JSON.stringify({}) }),
  pdfUrl: (id) => `/api/ca/applications/${id}/pdf`,
  download: async (id) => {
    const load = () => fetch(`/api/ca/applications/${id}/pdf`, { credentials: 'include', cache: 'no-store' });
    let response = await load();
    if (response.status === 401) {
      await apiRequest('/auth/refresh', { method: 'POST', _retry: true });
      response = await load();
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error?.message || 'The form could not be downloaded.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${id}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
  adminWindows: () => apiRequest('/ca/admin/windows'),
  saveWindow: (body) => apiRequest('/ca/admin/windows', { method: 'POST', body: JSON.stringify(body) }),
  deleteWindow: (id) => apiRequest(`/ca/admin/windows/${id}`, { method: 'DELETE' }),
  adminApplications: (params) => apiRequest(`/ca/admin/applications${qs(params)}`),
  confirmReceipt: (id, receipt) =>
    apiRequest(`/ca/admin/applications/${id}/confirm-receipt`, { method: 'POST', body: JSON.stringify({ receipt }) }),
  verify: (id, body) =>
    apiRequest(`/ca/admin/applications/${id}/verify`, { method: 'POST', body: JSON.stringify(body) }),
  approve: (id) => apiRequest(`/ca/admin/applications/${id}/approve`, { method: 'POST', body: JSON.stringify({}) }),
  reject: (id, body) =>
    apiRequest(`/ca/admin/applications/${id}/reject`, { method: 'POST', body: JSON.stringify(body) }),
  reopen: (id, body) =>
    apiRequest(`/ca/admin/applications/${id}/reopen`, { method: 'POST', body: JSON.stringify(body) }),
  reconciliation: () => apiRequest('/ca/admin/reconciliation'),
  unresolvedConditions: () => apiRequest('/ca/admin/conditions'),
  backfill: () => apiRequest('/ca/admin/backfill', { method: 'POST', body: JSON.stringify({}) }),
  scanVerify: (receipt, inspectionConfirmed) =>
    apiRequest('/ca/admin/scan-verify', { method: 'POST', body: JSON.stringify({ receipt, inspectionConfirmed }) }),
  lecturerEligible: () => apiRequest('/ca/lecturer/eligible-students'),
  lecturerSchedules: () => apiRequest('/ca/lecturer/schedules'),
  examNotices: () => apiRequest('/ca/lecturer/exam-notices'),
  publishExamNotice: (body) =>
    apiRequest('/ca/lecturer/exam-notices', { method: 'POST', body: JSON.stringify(body) }),
  rescheduleExamNotice: (id, body) =>
    apiRequest(`/ca/lecturer/exam-notices/${id}/reschedule`, { method: 'POST', body: JSON.stringify(body) }),
  cancelExamNotice: (id, reason) =>
    apiRequest(`/ca/lecturer/exam-notices/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  attachToExamNotice: (id) =>
    apiRequest(`/ca/lecturer/exam-notices/${id}/attach`, { method: 'POST', body: JSON.stringify({}) }),
  examNoticeDelivery: (id) => apiRequest(`/ca/lecturer/exam-notices/${id}/delivery`),
  saveAttendance: (noticeId, attendance) =>
    apiRequest(`/ca/lecturer/exam-notices/${noticeId}/attendance`, { method: 'PUT', body: JSON.stringify({ attendance }) }),
  confirmNoticeCompletion: (noticeId) =>
    apiRequest(`/ca/lecturer/exam-notices/${noticeId}/confirm-completion`, { method: 'POST', body: JSON.stringify({}) }),
  completeSubject: (linkId) =>
    apiRequest(`/ca/lecturer/subjects/${linkId}/complete`, { method: 'POST', body: JSON.stringify({}) }),
  recoveryResults: () => apiRequest('/ca/recovery-results'),
  decideRecovery: (id, decision) =>
    apiRequest(`/ca/recovery-results/${id}/decision`, { method: 'POST', body: JSON.stringify({ decision }) }),
};
