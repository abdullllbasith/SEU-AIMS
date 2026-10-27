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

export const academicApi = {
  overview: () => apiRequest('/academic/overview'),
  reconciliation: () => apiRequest('/academic/admin/reconciliation'),
  departments: () => apiRequest('/academic/departments'),
  createDepartment: (body) => apiRequest('/academic/departments', { method: 'POST', body: JSON.stringify(body) }),
  updateDepartment: (id, body) =>
    apiRequest(`/academic/departments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  batches: (params) => apiRequest(`/academic/batches${qs(params)}`),
  batch: (id) => apiRequest(`/academic/batches/${id}`),
  createBatch: (body) => apiRequest('/academic/batches', { method: 'POST', body: JSON.stringify(body) }),
  assignBatchContext: (id, body) =>
    apiRequest(`/academic/batches/${id}/academic-context`, { method: 'POST', body: JSON.stringify(body) }),
  reviseBatchContext: (id, body) =>
    apiRequest(`/academic/batches/${id}/academic-context`, { method: 'PATCH', body: JSON.stringify(body) }),
  updateBatch: (id, body) => apiRequest(`/academic/batches/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  years: (params) => apiRequest(`/academic/academic-years${qs(params)}`),
  createYear: (body) => apiRequest('/academic/academic-years', { method: 'POST', body: JSON.stringify(body) }),
  updateYear: (id, body) =>
    apiRequest(`/academic/academic-years/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteYear: (id) => apiRequest(`/academic/academic-years/${id}`, { method: 'DELETE' }),
  semesters: (params) => apiRequest(`/academic/semesters${qs(params)}`),
  createSemester: (body) => apiRequest('/academic/semesters', { method: 'POST', body: JSON.stringify(body) }),
  updateSemester: (id, body) =>
    apiRequest(`/academic/semesters/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteSemester: (id) => apiRequest(`/academic/semesters/${id}`, { method: 'DELETE' }),
  curriculum: (params) => apiRequest(`/academic/curriculum-mappings${qs(params)}`),
  createCurriculum: (body) =>
    apiRequest('/academic/curriculum-mappings', { method: 'POST', body: JSON.stringify(body) }),
  updateCurriculum: (id, body) =>
    apiRequest(`/academic/curriculum-mappings/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  offeringPreview: (batchId) => apiRequest(`/academic/batches/${batchId}/offering-generation`),
  generateOfferings: (batchId) =>
    apiRequest(`/academic/batches/${batchId}/offering-generation`, { method: 'POST', body: JSON.stringify({}) }),
  progressionPreview: (batchId) => apiRequest(`/academic/batches/${batchId}/progression`),
  progressBatch: (batchId) =>
    apiRequest(`/academic/batches/${batchId}/progression`, { method: 'POST', body: JSON.stringify({}) }),
  subjects: (params) => apiRequest(`/academic/subjects${qs(params)}`),
  createSubject: (body) => apiRequest('/academic/subjects', { method: 'POST', body: JSON.stringify(body) }),
  updateSubject: (id, body) =>
    apiRequest(`/academic/subjects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  offerings: (params) => apiRequest(`/academic/subject-offerings${qs(params)}`),
  createOffering: (body) =>
    apiRequest('/academic/subject-offerings', { method: 'POST', body: JSON.stringify(body) }),
  assignPeriodOfferings: (body) =>
    apiRequest('/academic/subject-offerings/from-curriculum', { method: 'POST', body: JSON.stringify(body) }),
  updateOffering: (id, body) =>
    apiRequest(`/academic/subject-offerings/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  offeringEnrollments: (offeringId, params) =>
    apiRequest(`/academic/subject-offerings/${offeringId}/enrollments${qs(params)}`),
  createOfferingEnrollment: (offeringId, body) =>
    apiRequest(`/academic/subject-offerings/${offeringId}/enrollments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  studentEnrollments: (contextId, params) =>
    apiRequest(`/academic/students/${contextId}/enrollments${qs(params)}`),
  cancelEnrollment: (enrollmentId) =>
    apiRequest(`/academic/enrollments/${enrollmentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CANCELLED' }),
    }),
  members: (params) => apiRequest(`/academic/members${qs(params)}`),
  setLecturerStatus: (id, lecturerStatus) =>
    apiRequest(`/academic/lecturers/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ lecturerStatus }),
    }),
  assignments: (params) => apiRequest(`/academic/lecturer-assignments${qs(params)}`),
  assignLecturer: (body) =>
    apiRequest('/academic/lecturer-assignments', { method: 'POST', body: JSON.stringify(body) }),
  revokeAssignment: (id) =>
    apiRequest(`/academic/lecturer-assignments/${id}`, { method: 'PATCH', body: JSON.stringify({}) }),
  students: (params) => apiRequest(`/academic/students${qs(params)}`),
  createStudentContext: (body) => apiRequest('/academic/students', { method: 'POST', body: JSON.stringify(body) }),
  updateStudentContext: (id, body) =>
    apiRequest(`/academic/students/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteStudentContext: (id) => apiRequest(`/academic/students/${id}`, { method: 'DELETE' }),
  myContext: () => apiRequest('/academic/me/context'),
  myOfferings: () => apiRequest('/academic/me/offerings'),
  catalogPreview: () => apiRequest('/academic/catalog-import'),
  catalogCommit: () => apiRequest('/academic/catalog-import', { method: 'POST', body: JSON.stringify({}) }),
  createUser: (body) => apiRequest('/auth/users', { method: 'POST', body: JSON.stringify(body) }),
};
