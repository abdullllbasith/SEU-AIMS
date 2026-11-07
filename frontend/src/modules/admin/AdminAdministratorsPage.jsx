import { useCallback, useEffect, useState } from 'react';
import { adminApi } from './admin-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';

function TemporaryPasswordNotice({ email, password, onDismiss }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="operation-notice operation-notice--success" role="status">
      <p>
        Temporary password for <strong>{email}</strong>. It is shown only once. Share it securely and ask them to
        change it after signing in.
      </p>
      <p>
        <code data-testid="temporary-password">{password}</code>
      </p>
      <div className="panel-actions">
        <button type="button" onClick={copy}>
          {copied ? 'Copied' : 'Copy password'}
        </button>
        <button type="button" onClick={onDismiss}>
          I have saved it
        </button>
      </div>
    </div>
  );
}

export function AdminAdministratorsPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [secret, setSecret] = useState(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await adminApi.admins();
      setItems(response.data?.items || []);
    } catch (caught) {
      setError(caught.message || 'Unable to load administrators');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createAdmin(event) {
    event.preventDefault();
    setError('');
    setSecret(null);
    setBusy('create');
    try {
      const response = await adminApi.createAdmin({ email: email.trim(), displayName: displayName.trim() });
      setSecret({ email: response.data.user.email, password: response.data.temporaryPassword });
      setEmail('');
      setDisplayName('');
      await load();
    } catch (caught) {
      setError(caught.message || 'Unable to create administrator');
    } finally {
      setBusy('');
    }
  }

  async function changeStatus(admin, nextStatus) {
    const verb = nextStatus === 'SUSPENDED' ? 'suspend' : 'restore';
    if (!window.confirm(`Are you sure you want to ${verb} ${admin.email}?`)) {
      return;
    }
    setError('');
    setSecret(null);
    setBusy(`status:${admin.id}`);
    try {
      await adminApi.setAdminStatus(admin.id, nextStatus);
      await load();
    } catch (caught) {
      setError(caught.message || 'Unable to update account status');
    } finally {
      setBusy('');
    }
  }

  async function resetPassword(admin) {
    if (
      !window.confirm(
        `Reset the password for ${admin.email}? Their current password stops working and they are signed out everywhere.`,
      )
    ) {
      return;
    }
    setError('');
    setSecret(null);
    setBusy(`reset:${admin.id}`);
    try {
      const response = await adminApi.resetAdminPassword(admin.id);
      setSecret({ email: admin.email, password: response.data.temporaryPassword });
    } catch (caught) {
      setError(caught.message || 'Unable to reset password');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="record-page">
      <PageHeader
        title="Administrators"
        purpose="Create department administrator accounts, suspend or restore them, and reset their passwords."
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {secret ? (
        <TemporaryPasswordNotice email={secret.email} password={secret.password} onDismiss={() => setSecret(null)} />
      ) : null}

      <Panel title="Create administrator" kicker="New account">
        <form className="settings-form" onSubmit={createAdmin}>
          <label>
            Display name
            <input
              name="displayName"
              value={displayName}
              maxLength={120}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              name="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@seu.ac.lk"
              required
            />
          </label>
          <p className="panel-footnote">
            The account joins your department. A temporary password is generated and shown once.
          </p>
          <div className="panel-actions">
            <button type="submit" disabled={busy !== ''}>
              {busy === 'create' ? 'Creating…' : 'Create administrator'}
            </button>
          </div>
        </form>
      </Panel>

      <Panel title="Department administrators" kicker={items ? `${items.length} total` : 'Loading'}>
        {items === null ? (
          <p aria-busy="true">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState>No administrator accounts found.</EmptyState>
        ) : (
          <ul className="stack-list">
            {items.map((admin) => {
              const suspended = admin.accountStatus === 'SUSPENDED';
              return (
                <li key={admin.id} className="stack-item">
                  <div>
                    <strong>{admin.displayName || admin.email}</strong>
                    {admin.isSelf ? ' (you)' : ''}
                    <br />
                    <span>{admin.email}</span> <span className="status-pill">{admin.accountStatus}</span>
                  </div>
                  {admin.isSelf ? (
                    <p className="panel-footnote">Use Profile to change your own password.</p>
                  ) : (
                    <span className="stack-item__actions">
                      <button type="button" disabled={busy !== ''} onClick={() => resetPassword(admin)}>
                        {busy === `reset:${admin.id}` ? 'Resetting…' : 'Reset password'}
                      </button>
                      {suspended ? (
                        <button type="button" disabled={busy !== ''} onClick={() => changeStatus(admin, 'ACTIVE')}>
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn--danger"
                          disabled={busy !== ''}
                          onClick={() => changeStatus(admin, 'SUSPENDED')}
                        >
                          Suspend
                        </button>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </section>
  );
}
