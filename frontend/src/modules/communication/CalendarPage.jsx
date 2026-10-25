import { useEffect, useState } from 'react';
import { communicationApi } from './communication-api.js';
import { experienceApi } from '../student-experience/experience-api.js';
import { useAuth } from '../../state/AuthProvider.jsx';
import { ROLES } from '../../constants/roles.js';
import { academicApi } from '../admin/academic-api.js';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { StatCard } from '../../ui/StatCard.jsx';
import { DeadlineList } from '../../ui/DeadlineList.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import { formatEventType } from '../../ui/status-labels.js';

export function CalendarPage() {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
    let cancelled = false;
    reload()
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load calendar');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    if (user?.role === ROLES.LECTURER) {
      academicApi
        .myOfferings()
        .then((body) => setOfferings(body.data.items || []))
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading) {
    return <PageSkeleton title="Academic calendar" variant="list" />;
  }

  const emptyGroups =
    groups &&
    !groups.today?.length &&
    !groups.nextFewDays?.length &&
    !groups.nextWeek?.length &&
    !groups.later?.length;

  return (
    <section className="record-page">
      <PageHeader
        title="Academic calendar"
        purpose="Agenda list of dated events for your role. There is no external calendar sync."
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="stat-row">
        <StatCard label="Upcoming events" value={upcoming.length} icon="semesters" />
        <StatCard label="Total in range" value={items.length} icon="years" />
        <StatCard
          label="Active events"
          value={items.filter((item) => !item.cancelledAt).length}
          icon="academic"
        />
      </div>

      <div className="dashboard-grid dashboard-grid--primary">
        <Panel title="Upcoming" kicker="Next windows">
          {groups ? (
            emptyGroups ? (
              <p className="deadline-empty">No upcoming events in the next windows.</p>
            ) : (
              <div className="agenda-grid">
                <DeadlineList title="Today" items={groups.today || []} />
                <DeadlineList title="Next few days" items={groups.nextFewDays || []} />
                <DeadlineList title="This week" items={groups.nextWeek || []} />
                <DeadlineList title="Later" items={groups.later || []} />
              </div>
            )
          ) : upcoming.length === 0 ? (
            <p className="deadline-empty">No upcoming events.</p>
          ) : (
            <ul className="stack-list">
              {upcoming.map((item) => (
                <li key={item.id}>
                  <span className="stack-item__title">{item.title}</span>
                  <span className="stack-item__meta">
                    {item.startsAt ? new Date(item.startsAt).toLocaleString() : ''}
                    {item.eventType ? ` · ${formatEventType(item.eventType)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {user?.role === ROLES.DEPARTMENT_ADMINISTRATOR ? (
          <Panel title="Create department event" kicker="Admin">
            <form
              className="settings-form"
              onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                setError('');
                communicationApi
                  .adminCreateEvent({
                    title: form.title,
                    startsAt: new Date(form.startsAt).toISOString(),
                    eventType: 'DEPARTMENT',
                  })
                  .then(() => {
                    setForm({ title: '', startsAt: '', subjectOfferingId: '' });
                    return reload();
                  })
                  .catch((caught) => setError(caught.message))
                  .finally(() => setBusy(false));
              }}
            >
              <label>
                Title
                <input
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  required
                />
              </label>
              <label>
                Starts
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
                  required
                />
              </label>
              <ActionButton type="submit" busy={busy} busyLabel="Creating…" disabled={busy}>
                Create event
              </ActionButton>
            </form>
          </Panel>
        ) : null}

        {user?.role === ROLES.LECTURER ? (
          <Panel title="Create assignment deadline" kicker="Lecturer">
            <form
              className="settings-form"
              onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                setError('');
                communicationApi
                  .lecturerCreateEvent({
                    title: form.title,
                    startsAt: new Date(form.startsAt).toISOString(),
                    subjectOfferingId: form.subjectOfferingId,
                  })
                  .then(() => {
                    setForm({ title: '', startsAt: '', subjectOfferingId: '' });
                    return reload();
                  })
                  .catch((caught) => setError(caught.message))
                  .finally(() => setBusy(false));
              }}
            >
              <label>
                Title
                <input
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  required
                />
              </label>
              <label>
                Offering
                <select
                  value={form.subjectOfferingId}
                  onChange={(event) => setForm({ ...form, subjectOfferingId: event.target.value })}
                  required
                >
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
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
                  required
                />
              </label>
              <ActionButton type="submit" busy={busy} busyLabel="Creating…" disabled={busy}>
                Create deadline
              </ActionButton>
            </form>
          </Panel>
        ) : null}
      </div>

      <Panel title="Full range" kicker={`${items.length} event${items.length === 1 ? '' : 's'}`}>
        {items.length === 0 ? (
          <EmptyState to="/" action="Back to home">
            No calendar events in range.
          </EmptyState>
        ) : (
          <ul className="stack-list">
            {items.map((item) => (
              <li key={item.id}>
                <div className="stack-item">
                  <span>
                    <span className="stack-item__title">{item.title}</span>
                    <span className="stack-item__meta">
                      {item.startsAt ? new Date(item.startsAt).toLocaleString() : ''}
                      {item.eventType ? ` · ${formatEventType(item.eventType)}` : ''}
                    </span>
                  </span>
                  {item.cancelledAt ? (
                    <span className="status-pill status-pill--danger">Cancelled</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}
