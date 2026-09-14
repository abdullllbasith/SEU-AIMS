const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

let csrfToken = '';
let refreshPromise = null;

export function setCsrfToken(token) {
  csrfToken = token || '';
}

export function getCsrfToken() {
  return csrfToken;
}

async function parseBody(response) {
  return response.json().catch(() => null);
}

export async function apiRequest(path, options = {}) {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE}${path.replace(/^\/api/, '')}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (response.status === 401 && !options._retry && !path.includes('/auth/')) {
    if (!refreshPromise) {
      refreshPromise = apiRequest('/auth/refresh', { method: 'POST', _retry: true })
        .catch(() => null)
        .finally(() => {
          refreshPromise = null;
        });
    }
    const refreshed = await refreshPromise;
    if (refreshed?.data?.csrfToken) {
      setCsrfToken(refreshed.data.csrfToken);
      return apiRequest(path, { ...options, _retry: true });
    }
  }

  const body = await parseBody(response);
  if (body?.data?.csrfToken) {
    setCsrfToken(body.data.csrfToken);
  }

  if (!response.ok) {
    const error = new Error(body?.error?.message || 'Request failed');
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

export function getHealth() {
  return fetch('/api/health', { credentials: 'include' }).then((response) => response.json());
}
