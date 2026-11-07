import { useState } from 'react';
import { apiRequest } from '../../services/api-client.js';
import { useAuth } from '../../state/AuthProvider.jsx';
import { Panel } from '../../ui/Panel.jsx';

const MIN_PASSWORD_LENGTH = 10;

export function ChangePasswordPanel() {
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    if (nextPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (nextPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (nextPassword === currentPassword) {
      setError('New password must be different from the current password');
      return;
    }
    setBusy(true);
    try {
      await apiRequest('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, nextPassword }),
      });
      setDone(true);
      setCurrentPassword('');
      setNextPassword('');
      setConfirmPassword('');
      // The server ends the session after a password change; sign in again with the new password.
      try {
        await logout();
      } catch {
        // Local state is reset by logout's finally block even when the request fails.
      }
    } catch (caught) {
      setError(
        caught.message === 'Invalid credentials'
          ? 'Current password is incorrect'
          : caught.message || 'Unable to change password',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Change password" kicker="Security">
      <form className="settings-form" onSubmit={onSubmit}>
        <label>
          Current password
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            name="nextPassword"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={nextPassword}
            onChange={(event) => setNextPassword(event.target.value)}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </label>
        <p className="panel-footnote">
          Minimum {MIN_PASSWORD_LENGTH} characters. You will be signed out and must sign in again.
        </p>
        <div className="panel-actions">
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="operation-notice operation-notice--success" role="status">
          Password changed. Signing you out…
        </p>
      ) : null}
    </Panel>
  );
}
