import { randomBytes } from 'node:crypto';

export function registrationKey(registrationNumber) {
  return String(registrationNumber || '')
    .toUpperCase()
    .replace(/^SEU\/IS\//, '')
    .replace(/[^A-Z0-9]/g, '');
}

/** Short public id: CA-21ICT028-Y1S2. A later application for the same period adds -2. */
export function createPublicApplicationId({ registrationNumber, yearSequence, semesterSequence, copy = 1 } = {}) {
  const registration = registrationKey(registrationNumber);
  const year = Number(yearSequence);
  const semester = Number(semesterSequence);
  if (!registration || !year || !semester) {
    return `CA-${randomBytes(3).toString('hex').toUpperCase()}`;
  }
  const base = `CA-${registration}-Y${year}S${semester}`;
  return copy > 1 ? `${base}-${copy}` : base;
}

export function createQrVerificationToken() {
  return randomBytes(24).toString('base64url');
}
