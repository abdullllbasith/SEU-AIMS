import { describe, expect, it } from 'vitest';
import { loginErrorMessage } from './login-errors.js';

describe('loginErrorMessage', () => {
  it('maps rate limit, CSRF, and unauthorized separately', () => {
    expect(loginErrorMessage({ status: 429 })).toMatch(/Too many/);
    expect(loginErrorMessage({ status: 403, body: { error: { message: 'Invalid CSRF token' } } })).toMatch(
      /Refresh the page/,
    );
    expect(loginErrorMessage({ status: 401 })).toBe('Invalid email or password.');
  });
});
