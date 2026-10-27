import { SESSION_EXPIRED_EVENT, apiRequest } from '../../services/api-client.js';

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

export const resultsApi = {
  imports: (params) => apiRequest(`/results/imports${qs(params)}`),
  downloadTemplate: async () => {
    const response = await fetch('/api/results/imports/template', {
      credentials: 'include',
      cache: 'no-store',
    });
    if (response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error?.message || 'Template could not be downloaded.');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'SEU-AIMS-result-import-template.xlsx';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
  import: (id) => apiRequest(`/results/imports/${id}`),
  preview: (id, params) => apiRequest(`/results/imports/${id}/preview${qs(params)}`),
  createImport: (formData) => apiRequest('/results/imports', { method: 'POST', body: formData }),
  commit: (id) => apiRequest(`/results/imports/${id}/commit`, { method: 'POST', body: JSON.stringify({}) }),
  reject: (id) => apiRequest(`/results/imports/${id}/reject`, { method: 'POST', body: JSON.stringify({}) }),
  reprocess: (id) => apiRequest(`/results/imports/${id}/reprocess`, { method: 'POST', body: JSON.stringify({}) }),
  records: (params) => apiRequest(`/results/records${qs(params)}`),
  versions: (id) => apiRequest(`/results/records/${id}/versions`),
  analytics: () => apiRequest('/results/analytics'),
  reconciliation: () => apiRequest('/results/reconciliation'),
  me: () => apiRequest('/results/me'),
};

export const gpaApi = {
  me: () => apiRequest('/gpa/me'),
  quality: () => apiRequest('/gpa/admin/quality'),
  rebuild: () => apiRequest('/gpa/admin/rebuild', { method: 'POST', body: JSON.stringify({}) }),
};
