import { useState } from 'react';
import { adminApi } from './admin-api.js';
import { Panel } from '../../ui/Panel.jsx';

const MIN_PASSWORD_LENGTH = 10;

export function AccountActions({ userId, email, accountStatus, onStatusChange }) {
  const [status, setStatus] = useState(accountStatus || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function changeStatus(nextStatus) {
    const verb = nextStatus === 'SUSPENDED' ? 'suspend' : 'restore';
    if (!window.confirm(`Are you sure you want to ${verb} ${email || 'this account'}?`)) {
      return;
    }
    setBusy('status');
    setError('');
    setNotice('');
    try {
      const response = await adminApi.setAccountStatus(userId, nextStatus);
      const updated = response.data?.user?.accountStatus || nextStatus;
      setStatus(updated);
      onStatusChange?.(updated);
      setNotice(nextStatus === 'SUSPENDED' ? 'Account suspended. Existing sessions were signed out.' : 'Account restored.');
    } catch (caught) {
      setError(caught.message || 'Unable to update account status');
    } finally {
      setBusy('');
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setBusy('password');
    try {
      await adminApi.setAccountPassword(userId, password);
      setPassword('');
      setConfirmPassword('');
      setNotice('New password saved. Existing sessions for this account were signed out.');
    } catch (caught) {
      setError(caught.message || 'Unable to set password');
    } finally {
      setBusy('');
    }
  }

  const suspended = status === 'SUSPENDED';

  return (
    <Panel title="Account actions" kicker={email || 'Login'}>
      <p className="panel-footnote">
        Status <span className="status-pill">{status || '—'}</span>
      </p>
      <div className="panel-actions">
        {suspended ? (
          <button type="button" disabled={busy !== ''} onClick={() => changeStatus('ACTIVE')}>
            {busy === 'status' ? 'Saving…' : 'Restore account'}
          </button>
        ) : (
          <button type="button" className="btn--danger" disabled={busy !== ''} onClick={() => changeStatus('SUSPENDED')}>
            {busy === 'status' ? 'Saving…' : 'Suspend account'}
          </button>
        )}
      </div>

      <form className="settings-form" onSubmit={savePassword}>
        <label>
          New password
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <label>
          Confirm password
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
        <div className="panel-actions">
          <button type="submit" disabled={busy !== ''}>
            {busy === 'password' ? 'Saving…' : 'Set new password'}
          </button>
        </div>
      </form>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="operation-notice operation-notice--success" role="status">
          {notice}
        </p>
      ) : null}
    </Panel>
  );
}
