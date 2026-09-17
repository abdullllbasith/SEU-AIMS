import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { experienceApi, formatGpaDisplay } from './experience-api.js';
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
        <PageHeader title="Your academic workspace" purpose="Loading your current semester from the academic record…" />
      </section>
    );
  }
  if (state.error && !state.data) {
    return (
      <section>
        <PageHeader title="Your academic workspace" />
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
  const registration = data.academicContext?.registrationNumber;

  return (
    <section>
      <PageHeader
        title="Your academic workspace"
        purpose={`Current semester comes from your academic record${
          registration ? ` (${registration})` : ' (not yet recorded)'
        }. This page composes other modules; it does not store official grades.`}
        meta={data.generatedAt ? `Updated ${new Date(data.generatedAt).toLocaleString()}` : null}
        actions={
          <button type="button" onClick={() => load(true)}>
            Refresh
          </button>
        }
      />

      <div className="stat-row">
        <StatCard label="Current subjects" value={data.currentSubjects?.length ?? 0} to="/learning" />
        <StatCard
          label="Needs attention"
          value={data.attention?.length ?? 0}
          hint="Open items from the academic record"
        />
        <StatCard
          label="Unread notices inbox"
          value={data.notifications?.unreadCount ?? 0}
          to="/notifications"
        />
        <StatCard label="CGPA" value={data.performance?.available ? data.performance.cgpa : '—'} to="/performance" />
      </div>

      <Panel
        tone="attention"
        kicker={data.attention?.length ? `${data.attention.length} open` : 'Clear'}
        title="What needs my attention?"
      >
        <AttentionList
          items={data.attention}
          empty="No outstanding actions from the records we could load."
          emptyTo="/calendar"
          emptyAction="Open calendar"
        />
      </Panel>

      <div className="dashboard-grid">
        <Panel title="Upcoming deadlines and events">
          {!sections.calendar?.ok ? <p>{sections.calendar?.error}</p> : null}
          {sections.calendar?.ok ? (
            <>
              <DeadlineList title="Today" items={groups.today} />
              <DeadlineList title="Next few days" items={groups.nextFewDays} />
              <DeadlineList title="This week" items={groups.nextWeek} />
              <DeadlineList title="Later" items={groups.later} />
            </>
          ) : null}
        </Panel>

        <Panel title="Current subjects">
          {data.currentSubjects?.length ? (
            <ul className="entity-list">
              {data.currentSubjects.map((item) => (
                <li key={item.id}>
                  <Link className="offering-card" to={item.learningPath}>
                    <p className="offering-card__code">
                      {item.subjectCode} {item.subjectName}
                    </p>
                    <p className="offering-card__meta">
                      {item.credits != null ? `${item.credits} credits` : 'Credits not listed'}
                      {item.lecturers?.length ? ` · ${item.lecturers.join(', ')}` : ''}
                      {` · ${item.publishedResourceCount} official resources`}
                    </p>
                    {item.nextEvent ? (
                      <p className="offering-card__meta">
                        Next: {item.nextEvent.title}{' '}
                        {item.nextEvent.startsAt ? new Date(item.nextEvent.startsAt).toLocaleString() : ''}
                      </p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState to="/academic/me" action="Open academic context">
              No current subject offerings.
            </EmptyState>
          )}
        </Panel>

        <Panel title="Recently published official resources">
          {!sections.learning?.ok ? <p>{sections.learning?.error}</p> : null}
          {sections.learning?.ok && !data.resources?.latestResources?.length ? (
            <p className="empty-state">No published official resources in your current offerings yet.</p>
          ) : null}
          <ul className="stack-list">
            {(data.resources?.latestResources || []).map((item) => (
              <li key={item.id}>
                <Link to={item.learningPath}>
                  <span className="stack-item__title">
                    {item.subjectCode}: {item.title}
                  </span>
                  {item.publishedAt ? (
                    <span className="stack-item__meta">{new Date(item.publishedAt).toLocaleString()}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
          <p className="panel-footnote">
            These are official course files, not Study Room shares. <Link to="/learning">All official resources</Link>
          </p>
        </Panel>

        <Panel title="Performance">
          {!sections.gpa?.ok ? <p>{sections.gpa?.error}</p> : null}
          <p className="figure-line">{formatGpaDisplay(data.performance)}</p>
          {data.results?.eca?.length ? (
            <p className="stack-item__meta">
              Unresolved E(CA): {data.results.eca.map((item) => item.subjectCode).join(', ')}. See{' '}
              <Link to="/ca">CA recovery</Link>.
            </p>
          ) : null}
          <p className="panel-footnote">
            <Link to="/performance">Full analytics</Link> · <Link to="/results/me">Official results</Link>
          </p>
        </Panel>

        <Panel title="CA recovery">
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
            <ul className="stack-list">
              {data.caRecovery.unresolvedConditions.map((item) => (
                <li key={item.subjectCode}>
                  <span className="stack-item__title">{item.subjectCode}</span>
                  <span className="stack-item__meta">Condition {item.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No open incomplete CA conditions.</p>
          )}
          {data.caRecovery?.application ? (
            <p className="stack-item__meta">
              Application {data.caRecovery.application.applicationId}: {data.caRecovery.application.workflowStatus}
            </p>
          ) : null}
          <p className="panel-footnote">
            <Link to="/ca">Open CA recovery</Link>
          </p>
        </Panel>

        <Panel title="Notices">
          {!sections.notices?.ok ? <p>{sections.notices?.error}</p> : null}
          {sections.notices?.ok && !data.notices.length ? <p className="empty-state">No current notices.</p> : null}
          <ul className="stack-list">
            {data.notices.map((item) => (
              <li key={item.id}>
                <Link to={`/notices/${item.id}`}>
                  <span className="stack-item__title">{item.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Notifications">
          {!sections.notifications?.ok ? <p>{sections.notifications?.error}</p> : null}
          <p className="figure-line">Unread {data.notifications?.unreadCount ?? 'unavailable'}</p>
          <ul className="stack-list">
            {(data.notifications?.recent || []).map((item) => (
              <li key={item.id}>
                {item.actionPath ? (
                  <Link to={item.actionPath}>
                    <span className="stack-item__title">{item.title}</span>
                  </Link>
                ) : (
                  <span className="stack-item__title">{item.title}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="panel-footnote">
            <Link to="/notifications">Inbox</Link>
          </p>
        </Panel>
      </div>
    </section>
  );
}
