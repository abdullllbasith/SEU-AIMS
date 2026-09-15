import { useEffect, useState } from 'react';
import { communicationApi } from './communication-api.js';
import { experienceApi } from '../student-experience/experience-api.js';
import { useAuth } from '../../state/AuthProvider.jsx';
import { ROLES } from '../../constants/roles.js';
import { academicApi } from '../admin/academic-api.js';

export function CalendarPage() {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [groups, setGroups] = useState(null);
  const [offerings, setOfferings] = useState([]);
  const [form, setForm] = useState({ title: '', startsAt: '', subjectOfferingId: '' });

  function reload() {
    const upcomingLoad =
      user?.role === ROLES.STUDENT
        ? experienceApi.upcoming().then((soon) => {
            setUpcoming(soon.data.items || []);
            setGroups(soon.data.deadlineGroups || null);
          })
        : communicationApi.upcoming().then((soon) => {
            setUpcoming(soon.data.items || []);
            setGroups(null);
          });
    return Promise.all([communicationApi.events(), upcomingLoad]).then(([events]) => {
      setItems(events.data.items || []);
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
      <p>Agenda list of dated events. There is no external calendar sync.</p>
      {error ? <p className="form-error">{error}</p> : null}
      <h2>Upcoming</h2>
      {groups ? (
        <>
          <h3>Today</h3>
          <ul>
            {groups.today.map((item) => (
              <li key={item.id}>
                {item.title} — {new Date(item.startsAt).toLocaleString()}
              </li>
            ))}
          </ul>
          <h3>Next few days</h3>
          <ul>
            {groups.nextFewDays.map((item) => (
              <li key={item.id}>
                {item.title} — {new Date(item.startsAt).toLocaleString()}
              </li>
            ))}
          </ul>
          <h3>This week</h3>
          <ul>
            {groups.nextWeek.map((item) => (
              <li key={item.id}>
                {item.title} — {new Date(item.startsAt).toLocaleString()}
              </li>
            ))}
          </ul>
          <h3>Later</h3>
          <ul>
            {groups.later.map((item) => (
              <li key={item.id}>
                {item.title} — {new Date(item.startsAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ul>
          {upcoming.map((item) => (
            <li key={item.id}>
              {item.title} — {new Date(item.startsAt).toLocaleString()} ({item.eventType})
            </li>
          ))}
        </ul>
      )}
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
