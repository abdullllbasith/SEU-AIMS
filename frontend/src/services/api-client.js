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

/**
 * Multipart upload with progress. fetch cannot report upload progress, so this uses XHR with the
 * same cookie + CSRF rules as apiRequest, and retries once after a silent session refresh.
 */
export function uploadWithProgress(path, formData, { onProgress } = {}) {
  const send = () =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}${path.replace(/^\/api/, '')}`);
      xhr.withCredentials = true;
      if (csrfToken) {
        xhr.setRequestHeader('X-CSRF-Token', csrfToken);
      }
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress?.(event.loaded / event.total);
        }
      };
      xhr.onerror = () => reject(Object.assign(new Error('Network error while uploading'), { status: 0 }));
      xhr.onload = () => {
        let body = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = null;
        }
        if (xhr.status >= 200 && xhr.status < 300 && body) {
          if (body.data?.csrfToken) {
            setCsrfToken(body.data.csrfToken);
          }
          resolve(body);
          return;
        }
        reject(Object.assign(new Error(body?.error?.message || 'Upload failed'), { status: xhr.status, body }));
      };
      xhr.send(formData);
    });

  return send().catch(async (error) => {
    if (error.status !== 401) {
      throw error;
    }
    const refreshed = await apiRequest('/auth/refresh', { method: 'POST', _retry: true }).catch(() => null);
    if (!refreshed?.data?.csrfToken) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }
      throw error;
    }
    setCsrfToken(refreshed.data.csrfToken);
    return send();
  });
}

export function getHealth() {
  return fetch('/api/health', { credentials: 'include' }).then((response) => response.json());
}
