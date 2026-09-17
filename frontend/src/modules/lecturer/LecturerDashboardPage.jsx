import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lecturerApi, offeringLabel } from './lecturer-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { StatCard } from '../../ui/StatCard.jsx';
import { AttentionList } from '../../ui/AttentionList.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';

function DeadlineList({ title, items }) {
  return (
    <div className="agenda-block">
      <h3>{title}</h3>
      {items.length === 0 ? <p className="empty-state">None.</p> : null}
      {items.length ? (
        <ul className="stack-list">
          {items.map((item) => (
            <li key={item.id}>
              <Link to="/calendar">
                <span className="stack-item__title">{item.title}</span>
                <span className="stack-item__meta">
                  {item.startsAt ? new Date(item.startsAt).toLocaleString() : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
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
        <PageHeader title="Teaching workspace" purpose="Loading assigned subject offerings…" />
      </section>
    );
  }
  if (state.error && !state.data) {
    return (
      <section>
        <PageHeader title="Teaching workspace" />
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
    <section>
      <PageHeader
        title="Teaching workspace"
        purpose="Scope is your lecturer assignments, not the whole department. Study Room is student-only. Official results are not edited here."
        meta={data.generatedAt ? `Updated ${new Date(data.generatedAt).toLocaleString()}` : null}
        actions={
          <button type="button" onClick={() => load(true)}>
            Refresh
          </button>
        }
      />
      <div className="stat-row">
        <StatCard label="Active assignments" value={summary.activeAssignments ?? 0} to="/lecturer/offerings" />
        <StatCard
          label="Unpublished resources"
          value={summary.unpublishedOfficialResources ?? 0}
          to="/lecturer/learning"
        />
        <StatCard
          label="CA awaiting schedule"
          value={summary.approvedCaAwaitingSchedule ?? 0}
          to="/lecturer/ca"
        />
        <StatCard label="Unread" value={data.notifications?.unreadCount ?? 0} to="/notifications" />
      </div>
      {data.lecturerStatus && data.lecturerStatus !== 'VERIFIED' ? (
        <p className="form-error" role="status">
          Lecturer status: {data.lecturerStatus}. Management stays disabled until verification.
        </p>
      ) : null}

      <Panel
        tone="attention"
        kicker={data.attention?.length ? `${data.attention.length} open` : 'Clear'}
        title="What needs attention?"
      >
        <AttentionList
          items={data.attention}
          empty="No outstanding teaching actions from the records we could load."
          emptyTo="/lecturer/offerings"
          emptyAction="Open assigned offerings"
        />
      </Panel>

      <div className="dashboard-grid">
        <Panel title="Assigned offerings">
          <p>
            Active {summary.activeAssignments ?? 0} · historical {summary.historicalAssignments ?? 0}
          </p>
          {data.currentOfferings?.length ? (
            <ul className="entity-list">
              {data.currentOfferings.map((item) => (
                <li key={item.id}>
                  <Link className="offering-card" to={item.workspacePath}>
                    <p className="offering-card__code">{offeringLabel(item)}</p>
                    <p className="offering-card__meta">
                      Published {item.resources?.published ?? 0} · unpublished {item.resources?.unpublished ?? 0}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState to="/profile" action="Open profile">
              No current assignments.
            </EmptyState>
          )}
          {data.historicalOfferings?.length ? (
            <>
              <h3>Inactive or historical</h3>
              <p>Read-only. These assignments do not grant management.</p>
              <ul>
                {data.historicalOfferings.map((item) => (
                  <li key={item.id}>
                    <Link to={item.workspacePath}>{offeringLabel(item)}</Link>
                    <span> (read-only)</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Panel>

        <Panel title="Official resources">
          {!sections.resources?.ok ? <p>{sections.resources?.error}</p> : null}
          <p>
            Published {summary.publishedOfficialResources ?? 0} · unpublished{' '}
            {summary.unpublishedOfficialResources ?? 0}
          </p>
          <p>
            Upload and publish stay on the learning pages. <Link to="/lecturer/learning">Manage resources</Link>
          </p>
        </Panel>

        <Panel title="CA recovery">
          {!sections.ca?.ok ? <p>{sections.ca?.error}</p> : null}
          <p>Approved awaiting schedule: {summary.approvedCaAwaitingSchedule ?? 0}</p>
          <p>Scheduled assessments: {summary.scheduledCaAssessments ?? 0}</p>
          {(data.caRecovery?.eligible || []).length === 0 ? (
            <p className="empty-state">No approved CA students in your assigned offerings.</p>
          ) : (
            <ul>
              {(data.caRecovery?.eligible || []).slice(0, 8).map((item) => (
                <li key={`${item.applicationId}-${item.subjectOfferingId}`}>
                  {item.registrationNumber} — {item.workflowStatus}
                </li>
              ))}
            </ul>
          )}
          <Link to="/lecturer/ca">Schedule and complete CA</Link>
        </Panel>

        <Panel title="Upcoming events">
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
        </Panel>

        <Panel title="Notices">
          {!sections.notices?.ok ? <p>{sections.notices?.error}</p> : null}
          {(data.notices || []).length === 0 ? <p className="empty-state">No current notices.</p> : null}
          <ul>
            {(data.notices || []).map((item) => (
              <li key={item.id}>
                <Link to={`/notices/${item.id}`}>{item.title}</Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Notifications">
          {!sections.notifications?.ok ? <p>{sections.notifications?.error}</p> : null}
          <p>Unread: {data.notifications?.unreadCount ?? 'unavailable'}</p>
          <Link to="/notifications">Inbox</Link>
        </Panel>
      </div>
    </section>
  );
}
