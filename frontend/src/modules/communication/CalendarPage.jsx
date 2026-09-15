import { useEffect, useState } from 'react';
import { communicationApi } from './communication-api.js';
import { useAuth } from '../../state/AuthProvider.jsx';
import { ROLES } from '../../constants/roles.js';
import { academicApi } from '../admin/academic-api.js';

export function CalendarPage() {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [offerings, setOfferings] = useState([]);
  const [form, setForm] = useState({ title: '', startsAt: '', subjectOfferingId: '' });

  function reload() {
    return Promise.all([communicationApi.events(), communicationApi.upcoming()]).then(([events, soon]) => {
      setItems(events.data.items || []);
      setUpcoming(soon.data.items || []);
    });
  }

  useEffect(() => {
    reload().catch((caught) => setError(caught.message));
    if (user?.role === ROLES.LECTURER) {
      academicApi
        .myOfferings()
        .then((body) => setOfferings(body.data.items || []))
        .catch(() => {});
    }
  }, [user]);

  return (
    <section>
      <h1>Academic calendar</h1>
      {error ? <p className="form-error">{error}</p> : null}
      <h2>Upcoming</h2>
      <ul>
        {upcoming.map((item) => (
          <li key={item.id}>
            {item.title} — {new Date(item.startsAt).toLocaleString()} ({item.eventType})
          </li>
        ))}
      </ul>
      {user?.role === ROLES.DEPARTMENT_ADMINISTRATOR ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            communicationApi
              .adminCreateEvent({ title: form.title, startsAt: new Date(form.startsAt).toISOString(), eventType: 'DEPARTMENT' })
              .then(reload)
              .catch((caught) => setError(caught.message));
          }}
        >
          <label>
            Department event
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>
          <label>
            Starts
            <input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
          </label>
          <button type="submit">Create event</button>
        </form>
      ) : null}
      {user?.role === ROLES.LECTURER ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            communicationApi
              .lecturerCreateEvent({
                title: form.title,
                startsAt: new Date(form.startsAt).toISOString(),
                subjectOfferingId: form.subjectOfferingId,
              })
              .then(reload)
              .catch((caught) => setError(caught.message));
          }}
        >
          <label>
            Assignment deadline
            <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </label>
          <label>
            Offering
            <select value={form.subjectOfferingId} onChange={(event) => setForm({ ...form, subjectOfferingId: event.target.value })}>
              <option value="">Select offering</option>
              {(Array.isArray(offerings) ? offerings : []).map((item) => (
                <option key={item.id || item._id} value={item.id || item._id}>
                  {item.subjectCode || item.name || item.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Starts
            <input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
          </label>
          <button type="submit">Create deadline</button>
        </form>
      ) : null}
      <h2>Range</h2>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.title} — {new Date(item.startsAt).toLocaleString()} ({item.eventType})
            {item.cancelledAt ? ' cancelled' : ''}
          </li>
        ))}
      </ul>
    </section>
  );
}
