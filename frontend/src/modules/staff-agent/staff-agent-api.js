import { apiRequest } from '../../services/api-client.js';

function createApi(prefix) {
  return {
    access: () => apiRequest(`${prefix}/access`),
    /** payload: { content, history? } where history is [{ role: 'user' | 'agent', text }] */
    send: (payload) => apiRequest(`${prefix}/messages`, { method: 'POST', body: JSON.stringify(payload) }),
  };
}

export const lecturerAgentApi = createApi('/lecturer-agent');
export const adminAgentApi = createApi('/admin-agent');
