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
    return { accepted: false, provider: 'noop', to: message.to };
  }
}

export function createWhatsAppProvider({ config }) {
  return new NoopWhatsAppProvider();
}
