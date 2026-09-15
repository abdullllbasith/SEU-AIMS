import { apiRequest } from '../../services/api-client.js';

export const experienceApi = {
  profile: () => apiRequest('/me/profile'),
  updateProfile: (body) => apiRequest('/me/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  uploadPhoto: (file) => {
    const data = new FormData();
    data.append('file', file);
    return apiRequest('/me/profile/photo', { method: 'POST', body: data });
  },
  dashboard: () => apiRequest('/me/dashboard'),
  history: (params = '') => apiRequest(`/me/academic-history${params}`),
  performance: () => apiRequest('/me/performance'),
};

export function formatGpaDisplay(gpaBlock) {
  if (!gpaBlock?.available) {
    return 'Performance calculation is not yet available.';
  }
  return `CGPA ${gpaBlock.cgpa}`;
}
