import { apiRequest } from '../../services/api-client.js';
import { formatOfferingLabel } from '../../ui/academic-labels.js';

export const lecturerApi = {
  dashboard: (refresh = false) => apiRequest(`/lecturer/dashboard${refresh ? '?refresh=true' : ''}`),
  offerings: () => apiRequest('/lecturer/subject-offerings'),
  offering: (id) => apiRequest(`/lecturer/subject-offerings/${id}`),
  upcoming: () => apiRequest('/lecturer/upcoming'),
  search: (q = '') => apiRequest(`/lecturer/search?q=${encodeURIComponent(q)}`),
  assignments: () => apiRequest('/lecturer/assignments'),
  caEligible: () => apiRequest('/lecturer/ca-recovery/eligible-students'),
  caSchedules: () => apiRequest('/lecturer/ca-recovery/schedules'),
};

export function offeringLabel(item) {
  return formatOfferingLabel(item) || 'Subject offering';
}
