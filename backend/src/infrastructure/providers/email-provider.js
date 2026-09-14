/**
 * Email delivery adapter. Vendor is not a business requirement.
 * Notifications module decides whether to send; this adapter sends.
 */
export class EmailProvider {
  async send(_message) {
    throw new Error('EmailProvider.send must be implemented');
  }
}

export class NoopEmailProvider extends EmailProvider {
  async send(message) {
    return { accepted: false, provider: 'noop', to: message.to };
  }
}

export function createEmailProvider({ config }) {
  return new NoopEmailProvider();
}
