import { sendSuccess } from '../../../shared/http/api-response.js';
import { asyncHandler } from '../../../shared/http/async-handler.js';
import * as query from '../services/audit-query.service.js';
import { runIntegrityChecks } from '../services/integrity.service.js';
import { liveness, readiness } from '../../../infrastructure/observability/health.service.js';
import {
  applyWhatsAppStatuses,
  verifyWhatsAppWebhookGet,
  verifyWhatsAppWebhookSignature,
} from '../services/webhook.service.js';

export function createAuditController() {
  return {
    list: asyncHandler(async (req, res) => {
      sendSuccess(res, await query.listAuditEvents(req.principal, req.query));
    }),
    summary: asyncHandler(async (req, res) => {
      sendSuccess(res, await query.auditSummary(req.principal));
    }),
    ops: asyncHandler(async (req, res) => {
      sendSuccess(res, await query.operationalSnapshot(req.principal, { infrastructure: req.app.get('infrastructure') }));
    }),
    integrity: asyncHandler(async (req, res) => {
      sendSuccess(res, await runIntegrityChecks(req.principal));
    }),
    rejectMutation: asyncHandler(async () => {
      query.rejectAuditMutation();
    }),
    live: asyncHandler(async (_req, res) => {
      sendSuccess(res, await liveness());
    }),
    ready: asyncHandler(async (req, res) => {
      const payload = await readiness({
        config: req.app.get('config'),
        infrastructure: req.app.get('infrastructure'),
      });
      sendSuccess(res, payload, { statusCode: payload.status === 'ready' ? 200 : 503 });
    }),
    whatsappVerify: asyncHandler(async (req, res) => {
      const challenge = verifyWhatsAppWebhookGet(req.query, req.app.get('config'));
      res.status(200).type('text/plain').send(challenge);
    }),
    whatsappReceive: asyncHandler(async (req, res) => {
      const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
      verifyWhatsAppWebhookSignature(raw, req.get('x-hub-signature-256'), req.app.get('config'));
      const receipts = await applyWhatsAppStatuses(req.body);
      sendSuccess(res, { accepted: true, receipts });
    }),
  };
}
