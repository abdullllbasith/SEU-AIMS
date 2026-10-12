import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { communicationApi } from './communication-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import { useAuth } from '../../state/AuthProvider.jsx';
import { ROLES } from '../../constants/roles.js';

export function NotificationsPage() {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);
  const [checks, setChecks] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      communicationApi.notifications(),
      communicationApi.preferences().catch(() => null),
    ])
      .then(([notes, preferences]) => {
        if (cancelled) {
          return;
        }
        setItems(notes.data.items || []);
        if (preferences) {
          setPrefs(preferences.data);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load notifications');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleMarkAllRead() {
    communicationApi
      .markAllRead()
      .then(() =>
        setItems((current) =>
          current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })),
        ),
      )
      .catch((err) => setError(err.message));
  }

  function handleMarkRead(id) {
    communicationApi
      .markRead(id)
      .then(() =>
        setItems((current) =>
          current.map((row) =>
            row.id === id ? { ...row, readAt: new Date().toISOString() } : row,
          ),
        ),
      )
      .catch((err) => setError(err.message));
  }

  function handleSavePreferences(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccessMessage('');
    communicationApi
      .savePreferences({
        locale: prefs.locale,
        emailEnabled: prefs.emailEnabled,
        whatsappEnabled: prefs.whatsappEnabled,
      })
      .then((body) => {
        setPrefs(body.data);
        setSuccessMessage('Delivery preferences updated successfully.');
        setTimeout(() => setSuccessMessage(''), 4000);
      })
      .catch((caught) => setError(caught.message))
      .finally(() => setSaving(false));
  }

  if (loading) {
    return <PageSkeleton title="Notifications" variant="list" />;
  }

  const unreadCount = items.filter((item) => !item.readAt).length;

  return (
    <section className="record-page notifications-layout">
      <PageHeader
        title="Notifications"
        purpose="Review recent department updates, academic announcements, and channel alerts."
        meta={
          unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
            : 'All caught up'
        }
        actions={
          unreadCount > 0 ? (
            <button type="button" onClick={handleMarkAllRead}>
              Mark all read
            </button>
          ) : null
        }
      />

      {user?.role === ROLES.DEPARTMENT_ADMINISTRATOR ? (
        <Panel title="Reminder checks" kicker="Admin diagnostic">
          <div className="panel-actions">
            <button
              type="button"
              onClick={() =>
                communicationApi
                  .communicationChecks()
                  .then((body) => setChecks(body.data))
                  .catch((caught) => setError(caught.message))
              }
            >
              Check reminders
            </button>
          </div>
          {checks ? (
            <p className="panel-lead">
              Open deliveries <strong>{checks.openDeliveryCount}</strong>
              <span className="panel-footnote__sep">·</span>
              Checks <strong>{checks.issueCount}</strong>
            </p>
          ) : null}
        </Panel>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {successMessage ? (
        <p className="auth-card__status" role="status">
          {successMessage}
        </p>
      ) : null}

      <div className="notifications-grid">
        <Panel title="Activity feed" kicker={`${items.length} total`}>
          {!error && items.length === 0 ? (
            <EmptyState to="/notices" action="Open notices">
              No notifications yet. You are up to date with the inbox.
            </EmptyState>
          ) : null}
          {items.length === 0 ? null : (
            <ul className="notification-list">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={item.readAt ? 'notification-item' : 'notification-item is-unread'}
                >
                  <div className="notification-item__head">
                    <p className="notification-item__title">
                      {!item.readAt ? <span className="notification-item__dot" aria-hidden="true" /> : null}
                      {item.title}
                    </p>
                    {item.category ? (
                      <span className="status-pill">{item.category}</span>
                    ) : null}
                  </div>
                  {item.body ? <p className="notification-item__body">{item.body}</p> : null}
                  <div className="notification-item__foot">
                    {item.actionPath ? (
                      <Link className="text-action" to={item.actionPath}>
                        Open record
                      </Link>
                    ) : (
                      <span />
                    )}
                    {!item.readAt ? (
                      <button type="button" onClick={() => handleMarkRead(item.id)}>
                        Mark read
                      </button>
                    ) : (
                      <span className="notification-item__read">Read</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {prefs ? (
          <Panel title="Optional channels" kicker="Preferences">
            <p className="panel-lead">
              Choose external notification channels. Mandatory academic alerts remain active in-app.
            </p>
            <form className="settings-form" onSubmit={handleSavePreferences}>
              <ul className="choice-list">
                <li>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(prefs.emailEnabled)}
                      onChange={(event) =>
                        setPrefs({ ...prefs, emailEnabled: event.target.checked })
                      }
                    />
                    <span>
                      <span className="stack-item__title">Email notifications</span>
                      <span className="stack-item__meta">
                        Digests and critical notice emails when the email provider is configured.
                      </span>
                    </span>
                  </label>
                </li>
                <li>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(prefs.whatsappEnabled)}
                      onChange={(event) =>
                        setPrefs({ ...prefs, whatsappEnabled: event.target.checked })
                      }
                    />
                    <span>
                      <span className="stack-item__title">WhatsApp broadcasts</span>
                      <span className="stack-item__meta">
                        Immediate updates via verified Cloud API messages when enabled.
                      </span>
                    </span>
                  </label>
                </li>
              </ul>
              <div className="panel-actions">
                <button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save preferences'}
                </button>
              </div>
            </form>
          </Panel>
        ) : null}
      </div>
    </section>
  );
}
