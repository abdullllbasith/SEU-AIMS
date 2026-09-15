/**
 * Public API for the audit-security module.
 * Other modules must import from this file only.
 */
import { createHealthRouter, createOpsRouter, createRouter, createWebhookRouter } from './routes/index.js';

export const MODULE_ID = 'audit-security';
export const API_PREFIX = '/api/audit';

export function createAuditSecurityModule() {
  const router = createRouter();
  return {
    id: MODULE_ID,
    apiPrefix: API_PREFIX,
    router,
    additionalRoutes: [
      { prefix: '/api/ops', router: createOpsRouter() },
      { prefix: '/api/webhooks', router: createWebhookRouter() },
      { prefix: '/api/health', router: createHealthRouter() },
    ],
  };
}

export { createRouter };
export { AuditEvent } from './models/audit-event.model.js';
export { recordAudit } from './services/record-audit.service.js';
export { verifyWhatsAppWebhookGet, verifyWhatsAppWebhookSignature } from './services/webhook.service.js';
