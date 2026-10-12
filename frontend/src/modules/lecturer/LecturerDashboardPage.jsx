import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lecturerApi, offeringLabel } from './lecturer-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { StatCard } from '../../ui/StatCard.jsx';
import { AttentionList } from '../../ui/AttentionList.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { DeadlineList } from '../../ui/DeadlineList.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';

function SectionError({ message }) {
  if (!message) {
    return null;
  }
  return <p className="section-error">{message}</p>;
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
        setState({
          loading: false,
          error: caught.message || 'Unable to load lecturer workspace',
          data: null,
        });
      });
  }

  useEffect(() => {
    load(false);
  }, []);

  if (state.loading && !state.data) {
    return <PageSkeleton title="Teaching workspace" variant="dashboard" stats={4} />;
  }

  if (state.error && !state.data) {
    return (
      <section className="home-dashboard">
        <PageHeader title="Teaching workspace" purpose="We could not compose your teaching home." />
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
  const attentionCount = data.attention?.length ?? 0;
  const unverified = data.lecturerStatus && data.lecturerStatus !== 'VERIFIED';

  return (
    <section className="home-dashboard">
      <PageHeader
        title="Teaching workspace"
        purpose="Scoped to your lecturer assignments — not the whole department. Study Room is student-only. Official results are not edited here."
        meta={data.generatedAt ? `Updated ${new Date(data.generatedAt).toLocaleString()}` : null}
        actions={
          <button type="button" onClick={() => load(true)} disabled={state.loading}>
            {state.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      <div className="stat-row">
        <StatCard
          label="Active assignments"
          value={summary.activeAssignments ?? 0}
          icon="assignments"
          to="/lecturer/offerings"
        />
        <StatCard
          label="Unpublished resources"
          value={summary.unpublishedOfficialResources ?? 0}
          icon="resources"
          to="/lecturer/learning"
        />
        <StatCard
          label="CA awaiting schedule"
          value={summary.approvedCaAwaitingSchedule ?? 0}
          icon="applications"
          to="/lecturer/ca"
        />
        <StatCard
          label="Unread"
          value={data.notifications?.unreadCount ?? 0}
          icon="notifications"
          to="/notifications"
        />
      </div>

      {unverified ? (
        <p className="form-error" role="status">
          Lecturer status: {data.lecturerStatus}. Management stays disabled until verification.
        </p>
      ) : null}

      <div className="home-dashboard__band">
        <Panel
          tone="attention"
          kicker={attentionCount ? `${attentionCount} open` : 'Clear'}
          title="What needs attention?"
        >
          <AttentionList
            items={data.attention}
            empty="No outstanding teaching actions from the records we could load."
            emptyTo="/lecturer/offerings"
            emptyAction="Open assigned offerings"
          />
        </Panel>
      </div>

      <div className="dashboard-grid dashboard-grid--primary">
        <Panel title="Assigned offerings">
          <p className="panel-lead">
            Active <strong>{summary.activeAssignments ?? 0}</strong>
            <span className="panel-footnote__sep">·</span>
            Historical <strong>{summary.historicalAssignments ?? 0}</strong>
          </p>
          {data.currentOfferings?.length ? (
            <ul className="entity-list">
              {data.currentOfferings.map((item) => (
                <li key={item.id}>
                  <Link className="offering-card" to={item.workspacePath}>
                    <p className="offering-card__code">{offeringLabel(item)}</p>
                    <p className="offering-card__meta">
                      Published {item.resources?.published ?? 0}
                      <span className="panel-footnote__sep">·</span>
                      Unpublished {item.resources?.unpublished ?? 0}
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
            <div className="panel-subsection">
              <h3>Inactive or historical</h3>
              <p className="stack-item__meta">Read-only. These assignments do not grant management.</p>
              <ul className="stack-list">
                {data.historicalOfferings.map((item) => (
                  <li key={item.id}>
                    <Link to={item.workspacePath}>
                      <span className="stack-item__title">{offeringLabel(item)}</span>
                      <span className="stack-item__meta">Read-only</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>

        <Panel title="Upcoming events">
          <SectionError message={!sections.calendar?.ok ? sections.calendar?.error : ''} />
          {sections.calendar?.ok ? (
            <>
              <DeadlineList title="Today" items={groups.today} />
              <DeadlineList title="Next few days" items={groups.nextFewDays} />
              <DeadlineList title="This week" items={groups.nextWeek} />
              <DeadlineList title="Later" items={groups.later} />
            </>
          ) : null}
          <p className="panel-footnote">
            <Link to="/calendar">Open calendar</Link>
          </p>
        </Panel>
      </div>

      <div className="dashboard-grid">
        <Panel title="Official resources">
          <SectionError message={!sections.resources?.ok ? sections.resources?.error : ''} />
          <p className="figure-line">
            {summary.publishedOfficialResources ?? 0}
            <span className="figure-line__hint"> published</span>
          </p>
          <p className="stack-item__meta">
            Unpublished: {summary.unpublishedOfficialResources ?? 0}. Upload and publish stay on the
            learning pages.
          </p>
          <p className="panel-footnote">
            <Link to="/lecturer/learning">Manage resources</Link>
          </p>
        </Panel>

        <Panel title="CA recovery">
          <SectionError message={!sections.ca?.ok ? sections.ca?.error : ''} />
          <p className="panel-lead">
            Approved awaiting schedule: <strong>{summary.approvedCaAwaitingSchedule ?? 0}</strong>
            <span className="panel-footnote__sep">·</span>
            Scheduled: <strong>{summary.scheduledCaAssessments ?? 0}</strong>
          </p>
          {(data.caRecovery?.eligible || []).length === 0 ? (
            <p className="deadline-empty">No approved CA students in your assigned offerings.</p>
          ) : (
            <ul className="stack-list">
              {(data.caRecovery?.eligible || []).slice(0, 8).map((item) => (
                <li key={`${item.applicationId}-${item.subjectOfferingId}`}>
                  <span className="stack-item__title">{item.registrationNumber}</span>
                  <span className="stack-item__meta">{item.workflowStatus}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="panel-footnote">
            <Link to="/lecturer/ca">Schedule and complete CA</Link>
          </p>
        </Panel>

        <Panel title="Notices">
          <SectionError message={!sections.notices?.ok ? sections.notices?.error : ''} />
          {(data.notices || []).length === 0 ? (
            <p className="deadline-empty">No current notices.</p>
          ) : (
            <ul className="stack-list">
              {(data.notices || []).map((item) => (
                <li key={item.id}>
                  <Link to={`/notices/${item.id}`}>
                    <span className="stack-item__title">{item.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="panel-footnote">
            <Link to="/notices">All notices</Link>
          </p>
        </Panel>

        <Panel title="Notifications">
          <SectionError
            message={!sections.notifications?.ok ? sections.notifications?.error : ''}
          />
          <p className="figure-line">
            Unread {data.notifications?.unreadCount ?? 'unavailable'}
          </p>
          <p className="panel-footnote">
            <Link to="/notifications">Open inbox</Link>
          </p>
        </Panel>
      </div>
    </section>
  );
}
