/**
 * Email delivery adapter. Vendor is not a business requirement.
 * Notifications module decides whether to send; this adapter sends.
 */
import nodemailer from 'nodemailer';

export class EmailProvider {
  async send(_message) {
    throw new Error('EmailProvider.send must be implemented');
  }
}

export class NoopEmailProvider extends EmailProvider {
  async send(message) {
    return { accepted: false, provider: 'noop', to: message.to, retryable: false, category: 'not_configured' };
  }
}

const TRANSIENT_CODES = new Set(['ETIMEDOUT', 'ECONNECTION', 'ECONNRESET', 'ECONNREFUSED', 'ESOCKET', 'EDNS', 'ETIMEOUT']);

/** Classify a nodemailer/SMTP error. Auth failures and 5xx replies are permanent; network errors and 4xx are retried. */
export function classifySmtpError(error) {
  const code = String(error?.code || '');
  const responseCode = Number(error?.responseCode) || 0;
  if (code === 'EAUTH' || responseCode === 535 || responseCode === 534) {
    return { retryable: false, category: 'auth' };
  }
  if (TRANSIENT_CODES.has(code)) {
    return { retryable: true, category: code === 'ETIMEDOUT' || code === 'ETIMEOUT' ? 'timeout' : 'network' };
  }
  if (responseCode >= 400 && responseCode < 500) {
    return { retryable: true, category: 'transient' };
  }
  if (responseCode >= 500) {
    return { retryable: false, category: 'permanent' };
  }
  return { retryable: true, category: 'transient' };
}

export class SmtpEmailProvider extends EmailProvider {
  constructor({ config, transport } = {}) {
    super();
    this.from = config.from;
    this.transport =
      transport ||
      nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
  }

  async send(message) {
    if (!message.to) {
      return { accepted: false, provider: 'smtp', retryable: false, category: 'no_recipient_address' };
    }
    try {
      const info = await this.transport.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.body,
      });
      const rejected = Array.isArray(info?.rejected) ? info.rejected : [];
      if (rejected.length) {
        return { accepted: false, provider: 'smtp', retryable: false, category: 'rejected_recipient' };
      }
      return { accepted: true, provider: 'smtp', providerMessageId: info?.messageId, category: 'accepted' };
    } catch (error) {
      const classified = classifySmtpError(error);
      return { accepted: false, provider: 'smtp', ...classified };
    }
  }
}

export function createEmailProvider({ config, transport } = {}) {
  const email = config?.email;
  if (email?.provider === 'smtp' && email.smtp?.host && email.from) {
    return new SmtpEmailProvider({ config: email, transport });
  }
  return new NoopEmailProvider();
}
