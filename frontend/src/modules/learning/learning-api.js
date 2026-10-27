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

export const learningApi = {
  offerings: (params) => apiRequest(`/learning/offerings${qs(params)}`),
  offering: (id) => apiRequest(`/learning/offerings/${id}`),
  sections: (offeringId) => apiRequest(`/learning/offerings/${offeringId}/sections`),
  createSection: (offeringId, body) =>
    apiRequest(`/learning/offerings/${offeringId}/sections`, { method: 'POST', body: JSON.stringify(body) }),
  updateSection: (id, body) =>
    apiRequest(`/learning/sections/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSection: (id) => apiRequest(`/learning/sections/${id}`, { method: 'DELETE' }),
  resources: (offeringId, params) => apiRequest(`/learning/offerings/${offeringId}/resources${qs(params)}`),
  createResource: (offeringId, formData) =>
    apiRequest(`/learning/offerings/${offeringId}/resources`, { method: 'POST', body: formData }),
  resource: (id) => apiRequest(`/learning/resources/${id}`),
  updateResource: (id, body) =>
    apiRequest(`/learning/resources/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  publish: (id) => apiRequest(`/learning/resources/${id}/publish`, { method: 'POST', body: JSON.stringify({}) }),
  unpublish: (id) => apiRequest(`/learning/resources/${id}/unpublish`, { method: 'POST', body: JSON.stringify({}) }),
  archive: (id) => apiRequest(`/learning/resources/${id}/archive`, { method: 'POST', body: JSON.stringify({}) }),
  versions: (id) => apiRequest(`/learning/resources/${id}/versions`),
  adminResources: (params) => apiRequest(`/learning/admin/resources${qs(params)}`),
  downloadUrl: (id) => `/api/learning/resources/${id}/download`,
};
