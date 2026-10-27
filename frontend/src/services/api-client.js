const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export const SESSION_EXPIRED_EVENT = 'seu-aims:session-expired';

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
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(options.body && !isForm ? { 'Content-Type': 'application/json' } : {}),
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE}${path.replace(/^\/api/, '')}`, {
    credentials: 'include',
    ...options,
    cache: 'no-store',
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
  }

  const body = await parseBody(response);
  const contentType = response.headers.get('content-type') || '';
  if (body?.data?.csrfToken) {
    setCsrfToken(body.data.csrfToken);
  }

  if (!response.ok) {
    const error = new Error(body?.error?.message || 'Request failed');
    error.status = response.status;
    error.body = body;
    throw error;
  }

  if (!body || typeof body !== 'object' || !contentType.includes('application/json')) {
    const error = new Error('Sign-in service is not available. The API is not running on this site.');
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

export function getHealth() {
  return fetch('/api/health', { credentials: 'include' }).then((response) => response.json());
}
