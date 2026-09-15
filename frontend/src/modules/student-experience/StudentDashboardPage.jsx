import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { experienceApi, formatGpaDisplay } from './experience-api.js';

function DeadlineList({ title, items }) {
  return (
    <div>
      <h3>{title}</h3>
      {items.length === 0 ? <p>None.</p> : null}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <Link to="/calendar">
              {item.title} — {item.startsAt ? new Date(item.startsAt).toLocaleString() : ''}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StudentDashboardPage() {
  const [state, setState] = useState({ loading: true, error: '', data: null });

  function load(refresh = false) {
    setState((current) => ({ ...current, loading: true, error: '' }));
    experienceApi
      .dashboard(refresh)
      .then((body) => {
        setState({ loading: false, error: '', data: body.data });
      })
      .catch((caught) => {
        setState({ loading: false, error: caught.message || 'Unable to load dashboard', data: null });
      });
  }

  useEffect(() => {
    load(false);
  }, []);

  if (state.loading) {
    return (
      <section aria-busy="true">
        <h1>Your academic workspace</h1>
        <p>Loading your current semester from the academic record…</p>
      </section>
    );
  }
  if (state.error && !state.data) {
    return (
      <section>
        <h1>Your academic workspace</h1>
        <p className="form-error" role="alert">
          {state.error}
        </p>
        <button type="button" onClick={() => load(true)}>
          Try again
        </button>
      </section>
    );
  }

  const data = state.data;
  const sections = data.sections || {};
  const groups = data.deadlineGroups || { today: [], nextFewDays: [], nextWeek: [], later: [] };

  return (
    <section className="student-dashboard">
      <h1>Your academic workspace</h1>
      <p>
        Current semester comes from your academic record
        {data.academicContext?.registrationNumber
          ? ` (${data.academicContext.registrationNumber})`
          : ' (not yet recorded)'}
        . This page composes other modules; it does not store official grades.
      </p>
      {data.generatedAt ? <p>Updated {new Date(data.generatedAt).toLocaleString()}</p> : null}
      <p>
        <button type="button" onClick={() => load(true)}>
          Refresh
        </button>{' '}
        <Link to="/search">Search official subjects and resources</Link>
      </p>

      <article>
        <h2>What needs my attention?</h2>
        {data.attention?.length ? (
          <ul>
            {data.attention.map((item, index) => (
              <li key={`${item.code}-${index}`}>
                <Link to={item.href}>{item.title}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>No outstanding actions from the records we could load.</p>
        )}
      </article>

      <article>
        <h2>Upcoming deadlines and events</h2>
        {!sections.calendar?.ok ? <p>{sections.calendar?.error}</p> : null}
        {sections.calendar?.ok ? (
          <>
            <DeadlineList title="Today" items={groups.today} />
            <DeadlineList title="Next few days" items={groups.nextFewDays} />
            <DeadlineList title="This week" items={groups.nextWeek} />
            <DeadlineList title="Later" items={groups.later} />
          </>
        ) : null}
      </article>

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
                  {item.credits != null ? <span> ({item.credits} credits)</span> : null}
                  {item.lecturers?.length ? <span> — {item.lecturers.join(', ')}</span> : null}
                  <span> — {item.publishedResourceCount} official resources</span>
                  {item.nextEvent ? (
                    <div>
                      Next: {item.nextEvent.title}{' '}
                      {item.nextEvent.startsAt ? new Date(item.nextEvent.startsAt).toLocaleString() : ''}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>No current subject offerings.</p>
          )}
        </article>

        <article>
          <h2>Recently published official resources</h2>
          {!sections.learning?.ok ? <p>{sections.learning?.error}</p> : null}
          {sections.learning?.ok && !data.resources?.latestResources?.length ? (
            <p>No published official resources in your current offerings yet.</p>
          ) : null}
          <ul>
            {(data.resources?.latestResources || []).map((item) => (
              <li key={item.id}>
                <Link to={item.learningPath}>
                  {item.subjectCode}: {item.title}
                </Link>
                {item.publishedAt ? ` — ${new Date(item.publishedAt).toLocaleString()}` : ''}
              </li>
            ))}
          </ul>
          <p>
            These are official course files, not Study Room shares. <Link to="/learning">All official resources</Link>
          </p>
        </article>

        <article>
          <h2>Performance</h2>
          {!sections.gpa?.ok ? <p>{sections.gpa?.error}</p> : null}
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
          {data.caRecovery?.window?.lifecycle ? (
            <p>
              Application window: {data.caRecovery.window.lifecycle}
              {data.caRecovery.window.closesAt
                ? ` (closes ${new Date(data.caRecovery.window.closesAt).toLocaleString()})`
                : ''}
            </p>
          ) : null}
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
          <h2>Notices</h2>
          {!sections.notices?.ok ? <p>{sections.notices?.error}</p> : null}
          {sections.notices?.ok && !data.notices.length ? <p>No current notices.</p> : null}
          <ul>
            {data.notices.map((item) => (
              <li key={item.id}>
                <Link to={`/notices/${item.id}`}>{item.title}</Link>
              </li>
            ))}
          </ul>
        </article>

        <article>
          <h2>Notifications</h2>
          {!sections.notifications?.ok ? <p>{sections.notifications?.error}</p> : null}
          <p>Unread: {data.notifications?.unreadCount ?? 'unavailable'}</p>
          <ul>
            {(data.notifications?.recent || []).map((item) => (
              <li key={item.id}>
                {item.actionPath ? <Link to={item.actionPath}>{item.title}</Link> : item.title}
              </li>
            ))}
          </ul>
          <Link to="/notifications">Inbox</Link>
        </article>
      </div>
      <p>
        <Link to="/academic/history">Academic history</Link> · <Link to="/study-room">Study Room (students only)</Link>
      </p>
    </section>
  );
}
