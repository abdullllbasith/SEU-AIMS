/**
 * Login identifier is email until the project owner finalizes another identifier.
 * Registration number remains academic identity, not the login key.
 */
import { User } from '../models/user.model.js';

export async function findUserByLoginIdentifier(identifier) {
  if (!identifier || typeof identifier !== 'string') {
    return null;
  }

  const email = identifier.trim().toLowerCase();
  if (!email.includes('@')) {
    return null;
  }

  return User.findOne({ email }).select('+passwordHash');
}

export async function findUserById(userId) {
  return User.findById(userId).select('+passwordHash');
}
