/**
 * Meta WhatsApp Cloud API adapter.
 * Domain modules must not construct Meta requests directly.
 */
export class WhatsAppProvider {
  async send(_message) {
    throw new Error('WhatsAppProvider.send must be implemented');
  }
}

export class NoopWhatsAppProvider extends WhatsAppProvider {
  async send(message) {
    return { accepted: false, provider: 'noop', to: message.to, retryable: false, category: 'not_configured' };
  }
}

export function classifyWhatsAppHttpStatus(status) {
  if (status === 429 || status >= 500) {
    return { retryable: true, category: 'transient' };
  }
  if (status === 401 || status === 403) {
    return { retryable: false, category: 'auth' };
  }
  return { retryable: false, category: 'permanent' };
}

export class MetaWhatsAppProvider extends WhatsAppProvider {
  constructor({ config, fetchImpl = fetch } = {}) {
    super();
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async send(message) {
    if (!message.to) {
      return { accepted: false, provider: 'meta', retryable: false, category: 'missing_recipient' };
    }
    const url = `${this.config.baseUrl}/${this.config.version}/${this.config.phoneNumberId}/messages`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: message.to,
        type: 'text',
        text: { body: String(message.body || '').slice(0, 1024) },
      }),
    });
    const classified = classifyWhatsAppHttpStatus(response.status);
    if (!response.ok) {
      return { accepted: false, provider: 'meta', retryable: classified.retryable, category: classified.category };
    }
    const payload = await response.json().catch(() => ({}));
    return {
      accepted: true,
      provider: 'meta',
      providerMessageId: payload?.messages?.[0]?.id,
      category: 'accepted',
    };
  }
}

export function createWhatsAppProvider({ config, fetchImpl } = {}) {
  if (config?.whatsapp?.accessToken && config?.whatsapp?.phoneNumberId) {
    return new MetaWhatsAppProvider({ config: config.whatsapp, fetchImpl });
  }
  return new NoopWhatsAppProvider();
}
