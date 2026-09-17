export function loginErrorMessage(caught) {
  const status = caught?.status;
  const code = caught?.body?.error?.code;
  const message = String(caught?.body?.error?.message || caught?.message || '');

  if (status === 429 || code === 'RATE_LIMITED') {
    return 'Too many sign-in attempts. Wait a few minutes, then refresh this page and try once.';
  }
  if (status === 403 || /csrf/i.test(message)) {
    return 'This sign-in form expired. Refresh the page and try again.';
  }
  if (status === 401) {
    return 'Invalid email or password.';
  }
  return message || 'Unable to sign in.';
}
