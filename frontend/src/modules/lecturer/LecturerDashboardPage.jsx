import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lecturerApi, offeringLabel } from './lecturer-api.js';

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

export function LecturerDashboardPage() {
  const [state, setState] = useState({ loading: true, error: '', data: null });

  function load(refresh = false) {
    setState((current) => ({ ...current, loading: true, error: '' }));
    lecturerApi
      .dashboard(refresh)
      .then((body) => {
        setState({ loading: false, error: '', data: body.data });
      })
      .catch((caught) => {
        setState({ loading: false, error: caught.message || 'Unable to load lecturer workspace', data: null });
      });
  }

  useEffect(() => {
    load(false);
  }, []);

  if (state.loading) {
    return (
      <section aria-busy="true">
        <h1>Teaching workspace</h1>
        <p>Loading assigned subject offerings…</p>
      </section>
    );
  }
  if (state.error && !state.data) {
    return (
      <section>
        <h1>Teaching workspace</h1>
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
  const summary = data.summary || {};

  return (
    <section className="student-dashboard">
      <h1>Teaching workspace</h1>
      <p>
        Scope is your lecturer assignments, not the whole department. Study Room is student-only. Official
        results are not edited here.
      </p>
      {data.generatedAt ? <p>Updated {new Date(data.generatedAt).toLocaleString()}</p> : null}
      {data.lecturerStatus && data.lecturerStatus !== 'VERIFIED' ? (
        <p className="form-error" role="status">
          Lecturer status: {data.lecturerStatus}. Management stays disabled until verification.
        </p>
      ) : null}
      <p>
        <button type="button" onClick={() => load(true)}>
          Refresh
        </button>{' '}
        <Link to="/lecturer/search">Search assigned subjects and resources</Link>
      </p>

      <article>
        <h2>What needs attention?</h2>
        {data.attention?.length ? (
          <ul>
            {data.attention.map((item, index) => (
              <li key={`${item.code}-${index}`}>
                <Link to={item.href}>{item.title}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>No outstanding teaching actions from the records we could load.</p>
        )}
      </article>

      <div className="dashboard-grid">
        <article>
          <h2>Assigned offerings</h2>
          <p>
            Active {summary.activeAssignments ?? 0} · historical {summary.historicalAssignments ?? 0}
          </p>
          {data.currentOfferings?.length ? (
            <ul>
              {data.currentOfferings.map((item) => (
                <li key={item.id}>
                  <Link to={item.workspacePath}>{offeringLabel(item)}</Link>
                  <span>
                    {' '}
                    — published {item.resources?.published ?? 0}, unpublished {item.resources?.unpublished ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No current assignments.</p>
          )}
          {data.historicalOfferings?.length ? (
            <>
              <h3>Inactive or historical</h3>
              <p>Read-only. These assignments do not grant management.</p>
              <ul>
                {data.historicalOfferings.map((item) => (
                  <li key={item.id}>
                    <Link to={item.workspacePath}>{offeringLabel(item)}</Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </article>

        <article>
          <h2>Official resources</h2>
          {!sections.resources?.ok ? <p>{sections.resources?.error}</p> : null}
          <p>
            Published {summary.publishedOfficialResources ?? 0} · unpublished{' '}
            {summary.unpublishedOfficialResources ?? 0}
          </p>
          <p>
            Upload and publish stay on the learning pages. <Link to="/lecturer/learning">Manage resources</Link>
          </p>
        </article>

        <article>
          <h2>CA recovery</h2>
          {!sections.ca?.ok ? <p>{sections.ca?.error}</p> : null}
          <p>Approved awaiting schedule: {summary.approvedCaAwaitingSchedule ?? 0}</p>
          <p>Scheduled assessments: {summary.scheduledCaAssessments ?? 0}</p>
          <ul>
            {(data.caRecovery?.eligible || []).slice(0, 8).map((item) => (
              <li key={`${item.applicationId}-${item.subjectOfferingId}`}>
                {item.registrationNumber} — {item.workflowStatus}
              </li>
            ))}
          </ul>
          <Link to="/lecturer/ca">Schedule and complete CA</Link>
        </article>

        <article>
          <h2>Upcoming events</h2>
          {!sections.calendar?.ok ? <p>{sections.calendar?.error}</p> : null}
          {sections.calendar?.ok ? (
            <>
              <DeadlineList title="Today" items={groups.today} />
              <DeadlineList title="Next few days" items={groups.nextFewDays} />
              <DeadlineList title="This week" items={groups.nextWeek} />
              <DeadlineList title="Later" items={groups.later} />
            </>
          ) : null}
          <Link to="/calendar">Calendar</Link>
        </article>

        <article>
          <h2>Notices</h2>
          {!sections.notices?.ok ? <p>{sections.notices?.error}</p> : null}
          <ul>
            {(data.notices || []).map((item) => (
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
          <Link to="/notifications">Inbox</Link>
        </article>
      </div>
      <p>
        <Link to="/profile">Profile</Link> · Study Room is not available to lecturers.
      </p>
    </section>
  );
}
