import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { communicationApi } from './communication-api.js';

export function NotificationsPage() {
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);

  useEffect(() => {
    communicationApi
      .notifications()
      .then((body) => setItems(body.data.items || []))
      .catch((caught) => setError(caught.message));
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
    </section>
  );
}
