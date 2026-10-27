import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { NoticeCarousel } from '../communication/NoticeCarousel.jsx';
import { experienceApi, formatGpaDisplay } from './experience-api.js';
import { GpaTrajectoryPanel } from './GpaTrajectoryPanel.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { StatCard } from '../../ui/StatCard.jsx';
import { AttentionList } from '../../ui/AttentionList.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { DeadlineList } from '../../ui/DeadlineList.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';

import { NotificationStackList } from '../communication/NotificationStackList.jsx';

function SectionError({ message }) {
  if (!message) {
    return null;
  }
  return <p className="section-error">{message}</p>;
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

  if (state.loading && !state.data) {
    return <PageSkeleton title="Your academic workspace" variant="dashboard" stats={4} />;
  }

  if (state.error && !state.data) {
    return (
      <section className="home-dashboard">
        <PageHeader title="Your academic workspace" purpose="We could not compose your home view." />
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
  const attentionCount = data.attention?.length ?? 0;

  return (
    <section className="home-dashboard">
      <PageHeader
        title="Your academic workspace"
        purpose={registration ? `Current semester · ${registration}` : 'Current semester overview'}
        meta={data.generatedAt ? `Updated ${new Date(data.generatedAt).toLocaleString()}` : null}
        actions={
          <button type="button" onClick={() => load(true)} disabled={state.loading}>
            {state.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      <div className="stat-row">
        <StatCard
          label="Current subjects"
          value={data.currentSubjects?.length ?? 0}
          icon="subjects"
          to="/learning"
        />
        <StatCard
          label="Needs attention"
          value={attentionCount}
          icon="attention"
          hint="Open items from academic records"
        />
        <StatCard
          label="Unread notifications"
          value={data.notifications?.unreadCount ?? 0}
          icon="notifications"
          to="/notifications"
        />
        <StatCard
          label="CGPA"
          value={data.performance?.available ? data.performance.cgpa : '—'}
          icon="gpa"
          to="/performance"
        />
      </div>

      <GpaTrajectoryPanel gpa={data.performance} compact />

      <div className="home-dashboard__band">
        <Panel
          tone="attention"
          kicker={attentionCount ? `${attentionCount} open` : 'Clear'}
          title="What needs my attention?"
        >
          <AttentionList
            items={data.attention}
            empty="No outstanding actions from the records we could load."
            emptyTo="/calendar"
            emptyAction="Open calendar"
          />
        </Panel>
      </div>

      <div className="dashboard-grid dashboard-grid--primary">
        <Panel title="Upcoming deadlines and events" kicker="Schedule windows">
          <SectionError message={!sections.calendar?.ok ? sections.calendar?.error : ''} />
          {sections.calendar?.ok ? (
            <div className="agenda-grid">
              <DeadlineList title="Today" items={groups.today} />
              <DeadlineList title="Next few days" items={groups.nextFewDays} />
              <DeadlineList title="This week" items={groups.nextWeek} />
              <DeadlineList title="Later" items={groups.later} />
            </div>
          ) : null}
          <p className="panel-footnote">
            <Link to="/calendar">Open calendar</Link>
          </p>
        </Panel>

        <Panel title="Current subjects" kicker={`${data.currentSubjects?.length ?? 0} enrolled`}>
          {data.currentSubjects?.length ? (
            <ul className="entity-list">
              {data.currentSubjects.map((item) => (
                <li key={item.id}>
                  <Link className="offering-card" to={item.learningPath}>
                    <p className="offering-card__code">
                      {item.subjectCode}{' '}
                      <span className="offering-card__name">{item.subjectName}</span>
                    </p>
                    <p className="offering-card__meta">
                      {item.credits != null ? `${item.credits} credits` : 'Credits not listed'}
                      {item.lecturers?.length ? ` · ${item.lecturers.join(', ')}` : ''}
                      {` · ${item.publishedResourceCount} official resources`}
                    </p>
                    {item.nextEvent ? (
                      <p className="offering-card__meta">
                        Next: {item.nextEvent.title}
                        {item.nextEvent.startsAt
                          ? ` · ${new Date(item.nextEvent.startsAt).toLocaleString()}`
                          : ''}
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
      </div>

      <div className="dashboard-grid">
        <Panel title="Recently published official resources" kicker="Course files">
          <SectionError message={!sections.learning?.ok ? sections.learning?.error : ''} />
          {sections.learning?.ok && !data.resources?.latestResources?.length ? (
            <EmptyState to="/learning" action="Browse official resources">
              No published official resources in your current offerings yet.
            </EmptyState>
          ) : null}
          {(data.resources?.latestResources || []).length ? (
            <ul className="stack-list">
              {(data.resources?.latestResources || []).map((item) => (
                <li key={item.id}>
                  <Link to={item.learningPath}>
                    <span className="stack-item__title">
                      {item.subjectCode}: {item.title}
                    </span>
                    {item.publishedAt ? (
                      <span className="stack-item__meta">
                        {new Date(item.publishedAt).toLocaleString()}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="panel-footnote">
            Official course files only — not Study Room shares.{' '}
            <Link to="/learning">All official resources</Link>
          </p>
        </Panel>

        <Panel title="Performance" kicker={data.performance?.classification || 'Official GPA'}>
          <SectionError message={!sections.gpa?.ok ? sections.gpa?.error : ''} />
          <div className="student-insight">
            <div className="student-insight__hero student-insight__hero--gpa">
              <div>
                <p className="student-insight__label">Cumulative GPA</p>
                <p className="student-insight__value">{formatGpaDisplay(data.performance)}</p>
                <p className="student-insight__meta">
                  {data.performance?.credits
                    ? `${data.performance.credits} official credits counted`
                    : 'Calculated from official results'}
                </p>
              </div>
              {data.performance?.available ? (
                <span className="status-pill status-pill--ok">
                  {data.performance?.classification || 'Verified'}
                </span>
              ) : null}
            </div>
          </div>
          {data.results?.eca?.length ? (
            <p className="stack-item__meta">
              Unresolved E(CA): {data.results.eca.map((item) => item.subjectCode).join(', ')}. See{' '}
              <Link to="/ca">CA recovery</Link>.
            </p>
          ) : null}
          <p className="panel-footnote">
            <Link to="/performance">Full analytics</Link>
            <span className="panel-footnote__sep">·</span>
            <Link to="/results/me">Official results</Link>
          </p>
        </Panel>

        <Panel title="CA recovery" kicker="Incomplete CA status">
          <SectionError message={!sections.ca?.ok ? sections.ca?.error : ''} />
          {data.caRecovery?.window?.lifecycle ? (
            <p className="panel-lead">
              Application window: <strong>{data.caRecovery.window.lifecycle}</strong>
              {data.caRecovery.window.closesAt
                ? ` · closes ${new Date(data.caRecovery.window.closesAt).toLocaleString()}`
                : ''}
            </p>
          ) : null}
          {data.caRecovery?.unresolvedConditions?.length ? (
            <ul className="stack-list">
              {data.caRecovery.unresolvedConditions.map((item) => (
                <li key={item.subjectCode}>
                  <div className="stack-item">
                    <span className="stack-item__title">{item.subjectCode}</span>
                    <span className="status-pill status-pill--pending">Condition {item.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="student-card-highlight">
              <p className="deadline-empty" style={{ margin: 0 }}>
                No open incomplete CA conditions.
              </p>
              <span className="status-pill status-pill--ok">Clear</span>
            </div>
          )}
          {data.caRecovery?.application ? (
            <p className="stack-item__meta">
              Application {data.caRecovery.application.applicationId}:{' '}
              {data.caRecovery.application.workflowStatus}
            </p>
          ) : null}
          <p className="panel-footnote">
            <Link to="/ca">Open CA recovery</Link>
          </p>
        </Panel>

        <Panel title="Notices" kicker="Department feed">
          <SectionError message={!sections.notices?.ok ? sections.notices?.error : ''} />
          {sections.notices?.ok && !(data.notices?.length) ? (
            <div className="student-card-highlight">
              <p className="deadline-empty" style={{ margin: 0 }}>
                No current notices.
              </p>
              <span className="status-pill status-pill--muted">0</span>
            </div>
          ) : null}
          {data.notices?.length ? (
            <ul className="stack-list">
              {data.notices.map((item) => (
                <li key={item.id}>
                  {item.images?.length ? (
                    <div className="notice-dashboard-card">
                      <NoticeCarousel images={item.images} label={item.title} />
                      <Link to={`/notices/${item.id}`}>
                        <span className="stack-item__title">{item.title}</span>
                      </Link>
                      <p className="stack-item__meta">{item.body}</p>
                    </div>
                  ) : (
                    <Link to={`/notices/${item.id}`}>
                      <span className="stack-item__title">{item.title}</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="panel-footnote">
            <Link to="/notices">All notices</Link>
          </p>
        </Panel>

        <Panel title="Notifications" kicker="Recent activity">
          <SectionError
            message={!sections.notifications?.ok ? sections.notifications?.error : ''}
          />
          <p className="panel-lead">
            {(data.notifications?.unreadCount ?? 0) > 0 ? (
              <>
                <strong>{data.notifications.unreadCount}</strong> unread
                <span className="panel-footnote__sep"> · </span>
              </>
            ) : null}
            Recent in-app alerts from Study Room, results, and department modules
          </p>
          {(data.notifications?.recent || []).length ? (
            <NotificationStackList items={data.notifications.recent} />
          ) : (
            <p className="deadline-empty">No recent notifications.</p>
          )}
          <p className="panel-footnote">
            <Link to="/notifications">Open inbox</Link>
          </p>
        </Panel>
      </div>
    </section>
  );
}
