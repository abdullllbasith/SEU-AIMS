import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const storage = new AsyncLocalStorage();

export function getRequestContext() {
  return storage.getStore() || {};
}

export function runWithRequestContext(context, fn) {
  return storage.run(context, fn);
}

export function createRequestContext(req) {
  const requestId = String(req.get('x-request-id') || req.get('x-correlation-id') || randomUUID());
  const correlationId = String(req.get('x-correlation-id') || requestId);
  return { requestId, correlationId };
}

export function currentCorrelationId() {
  return getRequestContext().correlationId || null;
}

export function currentRequestId() {
  return getRequestContext().requestId || null;
}
