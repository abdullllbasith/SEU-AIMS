import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { experienceApi, formatGpaDisplay } from './experience-api.js';

export function StudentDashboardPage() {
  const [state, setState] = useState({ loading: true, error: '', data: null });

  useEffect(() => {
    let cancelled = false;
    experienceApi
      .dashboard()
      .then((body) => {
        if (!cancelled) {
          setState({ loading: false, error: '', data: body.data });
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setState({ loading: false, error: caught.message || 'Unable to load dashboard', data: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return (
      <section aria-busy="true">
        <h1>Student dashboard</h1>
        <p>Loading your current semester…</p>
      </section>
    );
  }
  if (state.error) {
    return (
      <section>
        <h1>Student dashboard</h1>
        <p className="form-error" role="alert">
          {state.error}
        </p>
      </section>
    );
  }

  const data = state.data;
  const sections = data.sections || {};

  return (
    <section className="student-dashboard">
      <h1>Student dashboard</h1>
      <p>
        Current semester is taken from your academic record
        {data.academicContext?.registrationNumber
          ? ` (${data.academicContext.registrationNumber})`
          : ''}
        .
      </p>
      {data.generatedAt ? <p>Updated {new Date(data.generatedAt).toLocaleString()}</p> : null}

      <div className="dashboard-grid">
        <article>
          <h2>Current subjects</h2>
          {data.currentSubjects?.length ? (
            <ul>
              {data.currentSubjects.map((item) => (
                <li key={item.id}>
                  <Link to={item.learningPath}>
                    {item.subjectCode} {item.subjectName}
                  </Link>
                  {item.lecturers?.length ? <span> — {item.lecturers.join(', ')}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>No current subject offerings.</p>
          )}
        </article>

        <article>
          <h2>Notices</h2>
          {!sections.notices?.ok ? <p>{sections.notices?.error}</p> : null}
          {sections.notices?.ok && !data.notices.length ? <p>No current notices.</p> : null}
          <ul>
            {data.notices.map((item) => (
              <li key={item.id}>
                <Link to="/notices">{item.title}</Link>
              </li>
            ))}
          </ul>
        </article>

        <article>
          <h2>Upcoming events</h2>
          {!sections.calendar?.ok ? <p>{sections.calendar?.error}</p> : null}
          {sections.calendar?.ok && !data.upcomingEvents.length ? <p>No upcoming calendar events.</p> : null}
          <ul>
            {data.upcomingEvents.map((item) => (
              <li key={item.id}>
                {item.title} — {item.startsAt ? new Date(item.startsAt).toLocaleString() : ''}
              </li>
            ))}
          </ul>
        </article>

        <article>
          <h2>Performance</h2>
          <p>{formatGpaDisplay(data.performance)}</p>
          {data.results?.eca?.length ? (
            <p>
              Unresolved E(CA): {data.results.eca.map((item) => item.subjectCode).join(', ')}. See{' '}
              <Link to="/ca">CA recovery</Link>.
            </p>
          ) : null}
          <p>
            <Link to="/performance">Full analytics</Link> · <Link to="/results/me">Official results</Link>
          </p>
        </article>

        <article>
          <h2>CA recovery</h2>
          {!sections.ca?.ok ? <p>{sections.ca?.error}</p> : null}
          {data.caRecovery?.unresolvedConditions?.length ? (
            <ul>
              {data.caRecovery.unresolvedConditions.map((item) => (
                <li key={item.subjectCode}>
                  {item.subjectCode} — condition {item.status}
                </li>
              ))}
            </ul>
          ) : (
            <p>No open incomplete CA conditions.</p>
          )}
          {data.caRecovery?.application ? (
            <p>
              Application {data.caRecovery.application.applicationId}: {data.caRecovery.application.workflowStatus}
            </p>
          ) : null}
          <Link to="/ca">Open CA recovery</Link>
        </article>

        <article>
          <h2>Notifications</h2>
          <p>Unread: {data.notifications?.unreadCount ?? 'unavailable'}</p>
          <Link to="/notifications">Inbox</Link>
        </article>
      </div>
    </section>
  );
}
