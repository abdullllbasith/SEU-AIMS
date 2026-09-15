import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { communicationApi } from './communication-api.js';

export function NotificationsPage() {
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [prefs, setPrefs] = useState(null);

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

  return (
    <section>
      <h1>Notifications</h1>
      {error ? <p className="form-error">{error}</p> : null}
      <button type="button" onClick={() => communicationApi.markAllRead().then(() => setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() }))))}>
        Mark all read
      </button>
      {items.length === 0 ? <p>No notifications.</p> : null}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong> <span>{item.category}</span>
            {item.actionPath ? <Link to={item.actionPath}>Open</Link> : null}
            {!item.readAt ? (
              <button type="button" onClick={() => communicationApi.markRead(item.id).then(() => setItems((current) => current.map((row) => (row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row))))}>
                Mark read
              </button>
            ) : (
              ' Read'
            )}
          </li>
        ))}
      </ul>
      {prefs ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            communicationApi
              .savePreferences({
                locale: prefs.locale,
                emailEnabled: prefs.emailEnabled,
                whatsappEnabled: prefs.whatsappEnabled,
              })
              .then((body) => setPrefs(body.data))
              .catch((caught) => setError(caught.message));
          }}
        >
          <h2>Optional channels</h2>
          <p>In-app notices stay on. Mandatory academic types cannot be turned off.</p>
          <label>
            <input
              type="checkbox"
              checked={prefs.emailEnabled}
              onChange={(event) => setPrefs({ ...prefs, emailEnabled: event.target.checked })}
            />
            Email (optional types)
          </label>
          <label>
            <input
              type="checkbox"
              checked={prefs.whatsappEnabled}
              onChange={(event) => setPrefs({ ...prefs, whatsappEnabled: event.target.checked })}
            />
            WhatsApp (optional types)
          </label>
          <button type="submit">Save preferences</button>
        </form>
      ) : null}
    </section>
  );
}
