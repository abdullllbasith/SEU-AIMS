import { randomBytes } from 'node:crypto';

export function createPublicApplicationId() {
  return `CA-${randomBytes(16).toString('hex')}`;
}

export function createQrVerificationToken() {
  return randomBytes(24).toString('base64url');
}
