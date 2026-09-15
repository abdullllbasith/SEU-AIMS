import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { communicationApi } from './communication-api.js';
import { useAuth } from '../../state/AuthProvider.jsx';
import { ROLES } from '../../constants/roles.js';

export function NoticesPage() {
  const { user } = useAuth();
  const { noticeId } = useParams();
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: '', body: '' });

  function reload() {
    return communicationApi.notices().then((body) => setItems(body.data.items || []));
  }

  useEffect(() => {
    reload().catch((caught) => setError(caught.message));
  }, []);

  return (
    <section>
      <h1>Notices</h1>
      {error ? <p className="form-error">{error}</p> : null}
      {user?.role === ROLES.DEPARTMENT_ADMINISTRATOR ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            communicationApi
              .adminCreateNotice({ title: form.title, body: form.body, targeting: { kind: 'ALL_STUDENTS' } })
              .then((created) => communicationApi.publishNotice(created.data.id))
              .then(reload)
              .catch((caught) => setError(caught.message));
          }}
        >
          <label>
            Title
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>
          <label>
            Body
            <textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} />
          </label>
          <button type="submit">Publish notice</button>
        </form>
      ) : null}
      {items.length === 0 ? <p>No published notices for your scope.</p> : null}
      <ul>
        {items.map((item) => (
          <li key={item.id} id={`notice-${item.id}`}>
            <strong>{item.title}</strong>
            {noticeId === item.id ? ' (opened from notification)' : ''}
            {item.priority === 'HIGH' ? ' (high)' : ''}
            <p>{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
