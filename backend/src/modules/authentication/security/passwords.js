import argon2 from 'argon2';
import { ValidationError } from '../../../shared/errors/app-error.js';

export async function hashPassword(password, { minLength }) {
  if (!password || typeof password !== 'string' || password.length < minLength) {
    throw new ValidationError(`Password must be at least ${minLength} characters`);
  }

  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash, password) {
  if (!hash || !password) {
    return false;
  }

  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
