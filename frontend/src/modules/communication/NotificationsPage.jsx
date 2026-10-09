import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { communicationApi } from './communication-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';

export function NotificationsPage() {
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [items, setItems] = useState([]);
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    communicationApi
      .notifications()
      .then((body) => setItems(body.data.items || []))
      .catch((caught) => setError(caught.message));
    communicationApi
      .preferences()
      .then((body) => setPrefs(body.data))
      .catch(() => {});
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
          current.map((row) => (row.id === id ? { ...row, readAt: new Date().toISOString() } : row)),
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

  const unreadCount = items.filter((item) => !item.readAt).length;

  return (
    <section className="notifications-layout">
      <PageHeader
        title="Notifications"
        purpose="Review recent department updates, academic announcements, and channel alerts."
        meta={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
        actions={
          unreadCount > 0 ? (
            <button type="button" onClick={handleMarkAllRead} className="btn--secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Mark all read
            </button>
          ) : null
        }
      />

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {successMessage ? (
        <p style={{ color: 'var(--emerald-700)', background: 'var(--emerald-50)', border: '1px solid var(--emerald-100)', padding: '0.6rem 0.9rem', borderRadius: 'var(--radius-sm)', fontSize: '0.84rem', margin: '0 0 1rem' }}>
          ✓ {successMessage}
        </p>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 26rem), 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left: Notifications Feed */}
        <div className="panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '0.95rem' }}>Activity Feed</h2>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--slate-500)', background: 'var(--slate-100)', padding: '2px 8px', borderRadius: '999px' }}>
              {items.length} Total
            </span>
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--brand-50)', color: 'var(--brand-600)', display: 'grid', placeItems: 'center', margin: '0 auto 0.75rem' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <p style={{ margin: '0 0 0.25rem', fontWeight: 600, color: 'var(--slate-800)', fontSize: '0.92rem' }}>No notifications</p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--slate-400)' }}>You're completely up to date with department notices.</p>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.65rem' }}>
              {items.map((item) => (
                <li
                  key={item.id}
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    background: item.readAt ? '#ffffff' : 'var(--brand-50)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {!item.readAt ? (
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--brand-500)', flexShrink: 0 }} />
                      ) : null}
                      <strong style={{ fontSize: '0.88rem', color: 'var(--slate-900)' }}>{item.title}</strong>
                    </div>
                    {item.category ? (
                      <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, color: 'var(--slate-500)', background: 'var(--slate-100)', padding: '1px 6px', borderRadius: '4px' }}>
                        {item.category}
                      </span>
                    ) : null}
                  </div>

                  {item.body ? (
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--slate-600)', lineHeight: 1.4 }}>
                      {item.body}
                    </p>
                  ) : null}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px solid rgba(0, 0, 0, 0.04)' }}>
                    {item.actionPath ? (
                      <Link to={item.actionPath} style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--brand-600)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                        Open record &rarr;
                      </Link>
                    ) : <span />}

                    {!item.readAt ? (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(item.id)}
                        style={{ height: '26px', padding: '0 8px', fontSize: '0.74rem' }}
                      >
                        Mark read
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.74rem', color: 'var(--slate-400)' }}>✓ Read</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right: Preferences Card */}
        {prefs ? (
          <form onSubmit={handleSavePreferences} className="panel" style={{ padding: '1.4rem' }}>
            <h2 style={{ margin: '0 0 0.35rem', fontSize: '1rem' }}>Optional Channels</h2>
            <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--slate-500)', lineHeight: 1.45 }}>
              Choose external notification channels. Mandatory academic alerts remain active in-app.
            </p>

            <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.85rem 1rem' }}>
                <input
                  type="checkbox"
                  checked={Boolean(prefs.emailEnabled)}
                  onChange={(event) => setPrefs({ ...prefs, emailEnabled: event.target.checked })}
                  style={{ marginTop: '2px' }}
                />
                <div>
                  <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--slate-900)' }}>
                    Email Notifications
                  </span>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: '2px' }}>
                    Receive digest summaries and critical notice emails.
                  </span>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.85rem 1rem' }}>
                <input
                  type="checkbox"
                  checked={Boolean(prefs.whatsappEnabled)}
                  onChange={(event) => setPrefs({ ...prefs, whatsappEnabled: event.target.checked })}
                  style={{ marginTop: '2px' }}
                />
                <div>
                  <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--slate-900)' }}>
                    WhatsApp Broadcasts
                  </span>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: '2px' }}>
                    Receive immediate updates via verified Cloud API messages.
                  </span>
                </div>
              </label>
            </div>

            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save preferences'}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
