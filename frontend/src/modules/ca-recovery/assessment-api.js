import { apiRequest } from '../../services/api-client.js';

const post = (path, body = {}) => apiRequest(path, { method: 'POST', body: JSON.stringify(body) });

/** CA recovery marks and publication. The backend answers 404 while ASSESSMENT_MARKS_ENABLED is off. */
export const assessmentApi = {
  lecturerAttempts: () => apiRequest('/assessment/lecturer/attempts'),
  openAttempt: (linkId) => post(`/assessment/lecturer/subjects/${linkId}/attempt`),
  saveMarks: (id, caMark) =>
    apiRequest(`/assessment/attempts/${id}/marks`, { method: 'PUT', body: JSON.stringify({ caMark }) }),
  submit: (id) => post(`/assessment/attempts/${id}/submit`),
  adminAttempts: () => apiRequest('/assessment/admin/attempts'),
  verify: (id, esaMark) => post(`/assessment/attempts/${id}/verify`, esaMark === '' ? {} : { esaMark }),
  returnAttempt: (id, reason) => post(`/assessment/attempts/${id}/return`, { reason }),
  correctMarks: (id, body) => post(`/assessment/attempts/${id}/correct-marks`, body),
  recordBoard: (id, body) => post(`/assessment/attempts/${id}/board-authorization`, body),
  publish: (id, body = {}) => post(`/assessment/attempts/${id}/publish`, body),
};
