import { ValidationError } from '../../../shared/errors/app-error.js';

export function normalizePhone(input) {
  const raw = String(input ?? '').trim();
  if (!raw) {
    return '';
  }
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) {
    digits = `+${digits.slice(2)}`;
  }
  if (/^0\d{9}$/.test(digits)) {
    digits = `+94${digits.slice(1)}`;
  }
  if (/^94\d{9}$/.test(digits)) {
    digits = `+${digits}`;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) {
    throw new ValidationError('Enter a valid international phone number');
  }
  return digits;
}
