/**
 * Public API for the audit-security module.
 * Other modules must import from this file only.
 */
import { createRouter } from './routes/index.js';

export const MODULE_ID = 'audit-security';
export const API_PREFIX = '/api/audit';

export function createAuditSecurityModule() {
  const router = createRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
  };
}

export { createRouter };
export { AuditEvent } from './models/audit-event.model.js';
