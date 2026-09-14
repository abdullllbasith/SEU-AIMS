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
  departments: () => apiRequest('/academic/departments'),
  createDepartment: (body) => apiRequest('/academic/departments', { method: 'POST', body: JSON.stringify(body) }),
  updateDepartment: (id, body) =>
    apiRequest(`/academic/departments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  batches: (params) => apiRequest(`/academic/batches${qs(params)}`),
  createBatch: (body) => apiRequest('/academic/batches', { method: 'POST', body: JSON.stringify(body) }),
  updateBatch: (id, body) => apiRequest(`/academic/batches/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  years: (params) => apiRequest(`/academic/academic-years${qs(params)}`),
  createYear: (body) => apiRequest('/academic/academic-years', { method: 'POST', body: JSON.stringify(body) }),
  updateYear: (id, body) =>
    apiRequest(`/academic/academic-years/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  semesters: (params) => apiRequest(`/academic/semesters${qs(params)}`),
  createSemester: (body) => apiRequest('/academic/semesters', { method: 'POST', body: JSON.stringify(body) }),
  updateSemester: (id, body) =>
    apiRequest(`/academic/semesters/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  subjects: (params) => apiRequest(`/academic/subjects${qs(params)}`),
  createSubject: (body) => apiRequest('/academic/subjects', { method: 'POST', body: JSON.stringify(body) }),
  updateSubject: (id, body) =>
    apiRequest(`/academic/subjects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  offerings: (params) => apiRequest(`/academic/subject-offerings${qs(params)}`),
  createOffering: (body) =>
    apiRequest('/academic/subject-offerings', { method: 'POST', body: JSON.stringify(body) }),
  updateOffering: (id, body) =>
    apiRequest(`/academic/subject-offerings/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
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
  myContext: () => apiRequest('/academic/me/context'),
  myOfferings: () => apiRequest('/academic/me/offerings'),
  createUser: (body) => apiRequest('/auth/users', { method: 'POST', body: JSON.stringify(body) }),
};
