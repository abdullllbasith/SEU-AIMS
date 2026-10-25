import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, studentsCsvUrl } from './admin-api.js';
import { academicApi } from './academic-api.js';
import { communicationApi } from '../communication/communication-api.js';
import { gpaApi, resultsApi } from '../results/results-api.js';
import { studyRoomApi } from '../study-room/study-room-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { StatCard } from '../../ui/StatCard.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { StatIcon } from '../../ui/stat-icons.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import {
  displayOrDash,
  formatActiveSemestersLabel,
  formatActiveYearsLabel,
  formatDepartmentLead,
} from '../../ui/academic-labels.js';

const WORKSPACE_LINKS = [
  {
    to: '/admin/people',
    label: 'People directory',
    meta: 'Students and lecturers',
    icon: 'people',
  },
  {
    to: '/admin/academic',
    label: 'Academic admin',
    meta: 'Structure and membership',
    icon: 'academic',
  },
  {
    to: '/admin/results',
    label: 'Result imports',
    meta: 'Parse and commit files',
    icon: 'imports',
  },
  {
    to: '/admin/ca',
    label: 'CA recovery',
    meta: 'Applications and schedules',
    icon: 'applications',
  },
  {
    to: '/admin/offerings-health',
    label: 'Offering health',
    meta: 'Coverage and assignments',
    icon: 'health',
  },
  {
    to: '/admin/resources',
    label: 'Official resources',
    meta: 'Publication oversight',
    icon: 'resources',
  },
  {
    to: '/admin/study-room',
    label: 'Study Room moderation',
    meta: 'Student file review',
    icon: 'chat',
  },
  {
    to: '/admin/ops',
    label: 'Ops desk',
    meta: 'Queue, integrity, audit',
    icon: 'ops',
  },
];

const EVENT_TYPE_META = {
  CA_SCHEDULE: { label: 'CA schedule', tone: 'ca' },
  ASSIGNMENT_DEADLINE: { label: 'Assignment deadline', tone: 'deadline' },
  DEPARTMENT: { label: 'Academic event', tone: 'department' },
  OTHER: { label: 'Other event', tone: 'other' },
};

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function settledData(result) {
  return result.status === 'fulfilled' ? result.value?.data ?? result.value : null;
}

function formatEventWhen(item) {
  if (!item?.startsAt) {
    return '';
  }
  try {
    const start = new Date(item.startsAt);
    if (Number.isNaN(start.getTime())) {
      return String(item.startsAt);
    }
    const datePart = start.toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    if (item.allDay) {
      return `${datePart} · All day`;
    }
    const timePart = start.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    if (item.endsAt) {
      const end = new Date(item.endsAt);
      if (!Number.isNaN(end.getTime())) {
        const endTime = end.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        });
        return `${datePart} · ${timePart}–${endTime}`;
      }
    }
    return `${datePart} · ${timePart}`;
  } catch {
    return String(item.startsAt);
  }
}

function eventTypeMeta(eventType) {
  return EVENT_TYPE_META[eventType] || EVENT_TYPE_META.OTHER;
}

function buildActionItems(cards, extras) {
  const items = [
    {
      id: 'eca',
      count: asNumber(cards.unresolvedEcaConditions),
      title: 'Unresolved E(CA) cases',
      meta: 'Open incomplete CA conditions needing recovery workflow',
      to: '/admin/ca#unresolved-eca',
      icon: 'eca',
      tone: 'alert',
    },
    {
      id: 'ca-apps',
      count: asNumber(cards.pendingCaApplications),
      title: 'Pending CA applications',
      meta: 'Submitted or under verification',
      to: '/admin/ca',
      icon: 'applications',
      tone: 'watch',
    },
    {
      id: 'imports',
      count: asNumber(cards.pendingResultImports),
      title: 'Result imports awaiting review',
      meta: 'Uploaded or parsed files not yet committed',
      to: '/admin/results',
      icon: 'imports',
      tone: 'watch',
    },
    {
      id: 'moderation',
      count: asNumber(extras.moderationQueue),
      title: 'Study Room files awaiting moderation',
      meta: 'Student-shared files pending admin review',
      to: '/admin/study-room',
      icon: 'chat',
      tone: 'watch',
    },
    {
      id: 'resources',
      count: asNumber(cards.unpublishedOfficialResources),
      title: 'Unpublished official resources',
      meta: 'Draft or unpublished course materials',
      to: '/admin/resources',
      icon: 'resources',
      tone: 'neutral',
    },
  ];
  // Only include listing-derived counts when the fetched page covers the full total.
  if (extras.lecturerListingComplete) {
    items.splice(3, 0, {
      id: 'lecturers',
      count: asNumber(extras.unverifiedLecturers),
      title: 'Lecturers awaiting verification',
      meta: 'Accounts created but not verified for assignments',
      to: '/admin/people',
      icon: 'lecturers',
      tone: 'watch',
    });
  }
  if (extras.offeringListingComplete) {
    items.push({
      id: 'unassigned',
      count: asNumber(extras.unassignedOfferings),
      title: 'Offerings without an active lecturer',
      meta: 'Active offerings with no current assignment',
      to: '/admin/offerings-health',
      icon: 'health',
      tone: 'alert',
    });
  }
  return items.filter((item) => item.count > 0);
}

function buildHealthItems(cards) {
  return [
    {
      id: 'failed-notifications',
      label: 'Failed notifications',
      value: cards.failedNotifications ?? 0,
      to: '/admin/ops',
      tone: 'alert',
    },
    {
      id: 'failed-jobs',
      label: 'Failed background jobs',
      value: cards.failedBackgroundJobs ?? 0,
      to: '/admin/ops',
      tone: 'alert',
    },
    {
      id: 'denied-audit',
      label: 'Denied audit events',
      value: cards.deniedAuditEvents ?? 0,
      to: '/admin/ops',
      tone: 'alert',
    },
  ];
}

export function AdminDashboardPage() {
  const [state, setState] = useState({
    loading: true,
    error: '',
    data: null,
    extras: {
      overview: null,
      years: [],
      semesters: [],
      upcoming: [],
      notices: [],
      gpaQuality: null,
      analytics: null,
      unverifiedLecturers: 0,
      moderationQueue: 0,
      unassignedOfferings: 0,
      lecturerListingComplete: true,
      offeringListingComplete: true,
    },
  });

  const load = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: '' }));

    const withTimeout = (promise, ms) =>
      Promise.race([
        promise,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timed out')), ms);
        }),
      ]);

    // Primary shell must not wait on department-wide GPA quality scans.
    Promise.allSettled([
      adminApi.dashboard(),
      academicApi.overview(),
      academicApi.years({ status: 'ACTIVE', pageSize: 50 }),
      academicApi.semesters({ status: 'ACTIVE', pageSize: 50 }),
      communicationApi.upcoming(),
      communicationApi.notices(),
      studyRoomApi.moderationQueue(),
      adminApi.lecturers({ pageSize: 50 }),
      adminApi.offerings({ pageSize: 50 }),
    ])
      .then((results) => {
        const [
          dashboard,
          overview,
          years,
          semesters,
          upcoming,
          notices,
          moderation,
          lecturers,
          offerings,
        ] = results.map(settledData);

        const lecturerItems = lecturers?.items || [];
        const offeringItems = offerings?.items || [];
        const lecturerTotal = asNumber(lecturers?.total ?? lecturerItems.length);
        const offeringTotal = asNumber(offerings?.total ?? offeringItems.length);
        const unverifiedLecturers = lecturerItems.filter(
          (row) => row.lecturerStatus && row.lecturerStatus !== 'VERIFIED',
        ).length;
        const unassignedOfferings = offeringItems.filter((row) => row.unassigned).length;

        if (!dashboard) {
          throw new Error('Unable to load dashboard');
        }

        setState({
          loading: false,
          error: '',
          data: dashboard,
          extras: {
            overview: overview || null,
            years: years?.items || [],
            semesters: semesters?.items || [],
            upcoming: upcoming?.items || [],
            notices: (notices?.items || []).slice(0, 4),
            gpaQuality: null,
            analytics: null,
            unverifiedLecturers,
            moderationQueue: asNumber(moderation?.total ?? (moderation?.items || []).length),
            unassignedOfferings,
            lecturerListingComplete: lecturerTotal <= lecturerItems.length,
            offeringListingComplete: offeringTotal <= offeringItems.length,
            intelligencePending: true,
          },
        });

        return Promise.allSettled([
          withTimeout(gpaApi.quality(), 12_000),
          withTimeout(resultsApi.analytics(), 12_000),
        ]);
      })
      .then((intelResults) => {
        if (!intelResults) {
          return;
        }
        const [gpaQuality, analytics] = intelResults.map(settledData);
        setState((current) => ({
          ...current,
          extras: {
            ...current.extras,
            gpaQuality: gpaQuality || null,
            analytics: analytics || null,
            intelligencePending: false,
          },
        }));
      })
      .catch((caught) => {
        setState((current) => ({
          ...current,
          loading: false,
          error: caught.message || 'Unable to load dashboard',
          data: current.data,
          extras: {
            ...current.extras,
            intelligencePending: false,
          },
        }));
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cards = state.data?.cards || {};
  const extras = state.extras;
  const actionItems = useMemo(() => buildActionItems(cards, extras), [cards, extras]);
  const healthItems = useMemo(() => buildHealthItems(cards), [cards]);
  const attentionCount = actionItems.length;
  const activeYearLabel = formatActiveYearsLabel(extras.years);
  const activeSemesterLabels = formatActiveSemestersLabel(extras.semesters, extras.years);
  const gradeRows = extras.analytics?.gradeDistribution || [];
  const subjectAttention = extras.analytics?.subjectAttention || [];
  const gpaInsights = extras.gpaQuality?.insights || null;
  const qualityNeedsAttention =
    asNumber(extras.gpaQuality?.stale) > 0 ||
    asNumber(extras.gpaQuality?.missingSnapshot) > 0 ||
    asNumber(extras.gpaQuality?.unknownGradeRows) > 0;
  const department = extras.overview?.department;
  const computedLabel = state.data?.computedAt
    ? `Updated ${new Date(state.data.computedAt).toLocaleString()}`
    : null;
  const nowMs = Date.now();
  const upcomingEvents = extras.upcoming
    .filter((item) => {
      if (!item?.startsAt) {
        return false;
      }
      const start = new Date(item.startsAt).getTime();
      return Number.isFinite(start) && start >= nowMs - 60_000;
    })
    .slice(0, 6);

  if (state.loading && !state.data) {
    return <PageSkeleton title="Department operations" variant="dashboard" stats={6} />;
  }

  if (state.error && !state.data) {
    return (
      <section className="home-dashboard">
        <PageHeader title="Department operations" purpose="Operations home could not be loaded." />
        <p className="form-error" role="alert">
          {state.error}
        </p>
        <button type="button" onClick={load}>
          Try again
        </button>
      </section>
    );
  }

  return (
    <section className="home-dashboard admin-home">
      <PageHeader
        title="Department operations"
        purpose="Academic status, work that needs attention, and quick access to department workflows."
        meta={computedLabel}
        actions={
          <button type="button" onClick={load} disabled={state.loading}>
            {state.loading ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      {state.error ? (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="stat-row">
        <StatCard
          label="Active students"
          value={cards.activeStudents ?? '—'}
          icon="students"
          to="/admin/people"
        />
        <StatCard
          label="Active lecturers"
          value={cards.activeLecturers ?? '—'}
          icon="lecturers"
          to="/admin/people"
        />
        <StatCard
          label="Active offerings"
          value={cards.activeSubjectOfferings ?? '—'}
          icon="offerings"
          to="/admin/offerings-health"
        />
        <StatCard
          label="Pending result imports"
          value={cards.pendingResultImports ?? '—'}
          icon="imports"
          tone="watch"
          to="/admin/results"
        />
        <StatCard
          label="Unresolved E(CA)"
          value={cards.unresolvedEcaConditions ?? '—'}
          icon="eca"
          tone="alert"
          to="/admin/ca#unresolved-eca"
        />
        <StatCard
          label="Pending CA applications"
          value={cards.pendingCaApplications ?? '—'}
          icon="applications"
          tone="watch"
          to="/admin/ca"
        />
      </div>

      <div className="admin-home__grid admin-home__grid--primary">
        <div className="admin-home__stack">
          <Panel
            title="Action center"
            kicker={attentionCount ? `${attentionCount} needing attention` : 'Clear'}
          >
            <p className="panel-lead panel-lead--tight">
              Live administrative work only. Rows appear when a count is greater than zero.
            </p>
            {actionItems.length === 0 ? (
              <EmptyState to="/admin/academic" action="Academic admin">
                No open administrative tasks right now.
              </EmptyState>
            ) : (
              <ul className="action-center">
                {actionItems.map((item) => (
                  <li key={item.id}>
                    <Link
                      className={`action-center__item action-center__item--${item.tone}`}
                      to={item.to}
                    >
                      <StatIcon name={item.icon} className="action-center__icon" />
                      <span className="action-center__copy">
                        <span className="action-center__title">{item.title}</span>
                        <span className="action-center__meta">{item.meta}</span>
                      </span>
                      <span className="action-center__count">{item.count}</span>
                      <StatIcon name="chevron" className="action-center__chevron" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Grade & coverage distribution" kicker="Live department analytics">
            <div className="mini-chart-summary">
              <div className="mini-chart-pill">
                <span className="mini-chart-pill__label">Official results</span>
                <strong className="mini-chart-pill__value">
                  {extras.analytics?.officialResultCount ?? '—'}
                </strong>
              </div>
              <div className="mini-chart-pill">
                <span className="mini-chart-pill__label">Subjects cataloged</span>
                <strong className="mini-chart-pill__value">
                  {extras.overview?.counts?.subjects ?? '—'}
                </strong>
              </div>
              <div className="mini-chart-pill">
                <span className="mini-chart-pill__label">Curriculum mappings</span>
                <strong className="mini-chart-pill__value">
                  {extras.overview?.counts?.curriculumMappings ?? '—'}
                </strong>
              </div>
            </div>

            {gradeRows.length ? (
              <div className="ops-vchart" aria-label="Official grade distribution chart">
                <div className="ops-vchart__bars">
                  {gradeRows.slice(0, 8).map((row) => {
                    const max = Math.max(...gradeRows.map((item) => asNumber(item.count)), 1);
                    const total = Math.max(
                      gradeRows.reduce((sum, item) => sum + asNumber(item.count), 0),
                      1,
                    );
                    const count = asNumber(row.count);
                    const heightPct = Math.max(12, Math.round((count / max) * 100));
                    const sharePct = Math.round((count / total) * 100);
                    const isEca = String(row.resultCode).includes('E');
                    return (
                      <div
                        key={row.resultCode}
                        className="ops-vchart__col"
                        title={`${row.resultCode}: ${count} (${sharePct}%)`}
                      >
                        <span className="ops-vchart__count">{count}</span>
                        <div className="ops-vchart__track">
                          <span
                            className={
                              isEca
                                ? 'ops-vchart__fill ops-vchart__fill--warn'
                                : 'ops-vchart__fill'
                            }
                            style={{ height: `${heightPct}%` }}
                          />
                        </div>
                        <span className="ops-vchart__code">{row.resultCode}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="deadline-empty">
                {extras.intelligencePending
                  ? 'Loading grade distribution chart…'
                  : 'No official grade distribution recorded yet.'}
              </p>
            )}
          </Panel>
        </div>

        <Panel title="Academic overview" kicker="Current structure">
          <div className="overview-head">
            <p className="panel-lead panel-lead--tight">{formatDepartmentLead(department)}</p>
            <div className="overview-head__badges">
              {department?.code ? (
                <span className="overview-dept-badge" title="Department code">
                  {department.code}
                </span>
              ) : null}
              <span className="overview-summary-pill">
                {extras.years?.length || 0} Years · {activeSemesterLabels.length || cards.activeSemesters || 0} Semesters
              </span>
            </div>
          </div>

          <div className="overview-section">
            <div className="overview-section__header">
              <span className="overview-section__title">Active academic years &amp; semesters</span>
              <Link className="overview-section__action" to="/admin/academic">
                Configure →
              </Link>
            </div>
            {activeSemesterLabels.length ? (
              <div
                className="overview-year-grid"
                aria-label={`${activeYearLabel} — ${activeSemesterLabels.join(', ')}`}
              >
                {(() => {
                  const grouped = new Map();
                  for (const label of activeYearLabel.split(', ').filter(Boolean)) {
                    if (label !== 'None marked active') {
                      grouped.set(label, []);
                    }
                  }
                  for (const semLabel of activeSemesterLabels) {
                    const [yearPart, semPart] = semLabel.split(' · ');
                    if (semPart) {
                      if (!grouped.has(yearPart)) {
                        grouped.set(yearPart, []);
                      }
                      grouped.get(yearPart).push(semPart);
                    } else {
                      if (!grouped.has('Active')) {
                        grouped.set('Active', []);
                      }
                      grouped.get('Active').push(semLabel);
                    }
                  }
                  return [...grouped.entries()].map(([yearTitle, sems]) => (
                    <div key={yearTitle} className="overview-year-card">
                      <div className="overview-year-card__head">
                        <span className="overview-year-card__title">{yearTitle}</span>
                        <span className="overview-year-card__status">
                          <span className="overview-chip__dot" aria-hidden="true" />
                          Active
                        </span>
                      </div>
                      <div className="overview-year-card__semesters">
                        {sems.length ? (
                          sems.map((sem) => (
                            <span key={`${yearTitle}-${sem}`} className="overview-sem-pill">
                              <span className="overview-chip__dot" aria-hidden="true" />
                              {sem}
                            </span>
                          ))
                        ) : (
                          <span className="overview-empty-inline">No active semesters</span>
                        )}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <p className="overview-empty-inline">{activeYearLabel}</p>
            )}
          </div>

          <div className="overview-stats-grid">
            <Link className="overview-stat-tile" to="/admin/offerings-health">
              <span className="overview-stat-tile__label">Active subject offerings</span>
              <span className="overview-stat-tile__value">
                {displayOrDash(cards.activeSubjectOfferings)}
              </span>
            </Link>
            <Link className="overview-stat-tile" to="/admin/academic">
              <span className="overview-stat-tile__label">Active lecturer assignments</span>
              <span className="overview-stat-tile__value">
                {displayOrDash(extras.overview?.counts?.activeAssignments)}
              </span>
            </Link>
            <Link className="overview-stat-tile" to="/calendar">
              <span className="overview-stat-tile__label">Upcoming CA assessments</span>
              <span className="overview-stat-tile__value">
                {displayOrDash(cards.upcomingCaAssessments)}
              </span>
            </Link>
            <Link className="overview-stat-tile" to="/admin/people">
              <span className="overview-stat-tile__label">Student academic contexts</span>
              <span className="overview-stat-tile__value">
                {displayOrDash(extras.overview?.counts?.studentContexts)}
              </span>
            </Link>
          </div>

          <p className="panel-footnote">
            <Link to="/admin/academic">Manage academic structure</Link>
            <span className="panel-footnote__sep">·</span>
            <Link to="/admin/offerings-health">Offering health</Link>
          </p>
        </Panel>
      </div>

      <Panel title="Workspace" kicker="Shortcuts">
        <p className="panel-lead panel-lead--tight">Jump into frequent administrative workflows.</p>
        <ul className="shortcut-grid shortcut-grid--compact">
          {WORKSPACE_LINKS.map((item) => (
            <li key={item.to}>
              <Link className="shortcut-tile" to={item.to}>
                <StatIcon name={item.icon} className="shortcut-tile__icon" />
                <span className="shortcut-tile__copy">
                  <span className="shortcut-tile__title">{item.label}</span>
                  <span className="shortcut-tile__meta">{item.meta}</span>
                </span>
                <StatIcon name="chevron" className="shortcut-tile__chevron" />
              </Link>
            </li>
          ))}
          <li>
            <a className="shortcut-tile shortcut-tile--export" href={studentsCsvUrl()}>
              <StatIcon name="export" className="shortcut-tile__icon" />
              <span className="shortcut-tile__copy">
                <span className="shortcut-tile__title">Student directory CSV</span>
                <span className="shortcut-tile__meta">Offline export · max 500 rows</span>
              </span>
              <StatIcon name="chevron" className="shortcut-tile__chevron" />
            </a>
          </li>
        </ul>
      </Panel>

      <div className="admin-home__grid admin-home__grid--secondary">
        <Panel title="Academic calendar preview" kicker="Upcoming">
          <p className="panel-lead panel-lead--tight">
            Next dated events in department scope. Types and times come from published calendar
            records only.
          </p>
          {upcomingEvents.length === 0 ? (
            <div className="calendar-empty">
              <EmptyState to="/calendar" action="Open calendar">
                No upcoming calendar events are available.
              </EmptyState>
            </div>
          ) : (
            <ul className="calendar-preview">
              {upcomingEvents.map((item) => {
                const type = eventTypeMeta(item.eventType);
                return (
                  <li key={item.id || `${item.title}-${item.startsAt}`}>
                    <Link className="calendar-preview__item" to="/calendar">
                      <span className={`calendar-preview__type calendar-preview__type--${type.tone}`}>
                        {type.label}
                      </span>
                      <span className="calendar-preview__title" title={item.title}>
                        {item.title}
                      </span>
                      <span className="calendar-preview__when">{formatEventWhen(item)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {extras.notices.length ? (
            <div className="panel-subsection">
              <h3 className="preview-subhead">Important notices</h3>
              <ul className="preview-list preview-list--compact">
                {extras.notices.map((item) => (
                  <li key={item.id}>
                    <Link className="preview-list__item" to={`/notices/${item.id}`}>
                      <span className="preview-list__title" title={item.title}>
                        {item.title}
                      </span>
                      <span className="preview-list__meta">
                        {item.priority === 'HIGH' ? 'High priority notice' : 'Notice'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="panel-footnote">
            <Link to="/calendar">Full calendar</Link>
            <span className="panel-footnote__sep">·</span>
            <Link to="/notices">All notices</Link>
          </p>
        </Panel>

        <Panel title="System health" kicker="Operations">
          <p className="panel-lead panel-lead--tight">
            Platform and department delivery signals. Queue failed-job counts may be platform-wide.
          </p>
          <ul className="health-list">
            {healthItems.map((item) => {
              const n = asNumber(item.value);
              return (
                <li key={item.id}>
                  <Link
                    className={`health-list__item${n > 0 ? ` health-list__item--${item.tone}` : ''}`}
                    to={item.to}
                  >
                    <span className="health-list__label">{item.label}</span>
                    <span className="health-list__value">{displayOrDash(item.value)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="panel-footnote">
            <Link to="/admin/ops">Open ops desk</Link>
          </p>
        </Panel>
      </div>

      <Panel title="Academic intelligence" kicker="Department insights">
        <p className="panel-lead panel-lead--tight">
          Aggregated academic signals from verified GPA snapshots and official result codes.
          Individual student values are never shown here.
        </p>

        {extras.gpaQuality || extras.analytics ? (
          <>
            <div className="intel-block">
              <h3 className="preview-subhead">Academic insights</h3>
              {gpaInsights?.ready && gpaInsights.averageCgpa != null ? (
                <div className="intel-insights">
                  <article className="intel-card intel-card--accent">
                    <p className="intel-card__value">{gpaInsights.averageCgpa.toFixed(2)}</p>
                    <p className="intel-card__label">Average verified CGPA</p>
                    <p className="intel-card__hint">
                      Mean of {gpaInsights.verifiedSampleSize} current cumulative snapshots.
                    </p>
                  </article>
                  {gpaInsights.classificationDistribution?.length ? (
                    <ul className="intel-bands">
                      {gpaInsights.classificationDistribution.map((row) => (
                        <li key={row.classification}>
                          <span className="intel-bands__label">{row.classification}</span>
                          <span className="intel-bands__count">{row.count}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <p className="intel-muted">
                  Department CGPA averages appear when at least{' '}
                  {gpaInsights?.minimumSampleSize ?? 5} verified cumulative snapshots are current.
                  {gpaInsights
                    ? ` Currently ${gpaInsights.verifiedSampleSize} verified snapshot${
                        gpaInsights.verifiedSampleSize === 1 ? '' : 's'
                      }.`
                    : ' Quality endpoint unavailable.'}
                </p>
              )}

              {subjectAttention.length ? (
                <div className="intel-attention">
                  <h4 className="intel-attention__title">Subjects needing attention</h4>
                  <p className="intel-attention__hint">
                    Highest counts of D, E, or E(CA) among current official results.
                  </p>
                  <ul className="intel-attention__list">
                    {subjectAttention.map((row) => (
                      <li key={`${row.subjectCode}-${row.resultCode}`}>
                        <span className="intel-attention__code" title={row.subjectCode}>
                          {row.subjectCode}
                        </span>
                        <span className="intel-attention__result">{row.resultCode}</span>
                        <span className="intel-attention__count">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : extras.analytics ? (
                <p className="intel-muted">
                  No subject-level D / E / E(CA) concentrations in current official results.
                </p>
              ) : null}

              {asNumber(extras.analytics?.ecaCount) > 0 ? (
                <p className="intel-note intel-note--insight" role="status">
                  {`${extras.analytics.ecaCount} official E(CA) result${
                    extras.analytics.ecaCount === 1 ? '' : 's'
                  } in this department — review CA recovery workflows where needed.`}
                </p>
              ) : null}
            </div>

            <div className="panel-subsection">
              <h3 className="preview-subhead">Data quality</h3>
              {extras.gpaQuality ? (
                <div className="intel-grid">
                  <article className="intel-card">
                    <p className="intel-card__value">{extras.gpaQuality.current ?? 0}</p>
                    <p className="intel-card__label">Current GPA snapshots</p>
                  </article>
                  <article className="intel-card">
                    <p className="intel-card__value">{extras.gpaQuality.stale ?? 0}</p>
                    <p className="intel-card__label">Stale snapshots</p>
                  </article>
                  <article className="intel-card">
                    <p className="intel-card__value">{extras.gpaQuality.missingSnapshot ?? 0}</p>
                    <p className="intel-card__label">Missing snapshots</p>
                  </article>
                  <article className="intel-card">
                    <p className="intel-card__value">{extras.gpaQuality.unknownGradeRows ?? 0}</p>
                    <p className="intel-card__label">Unknown grade rows</p>
                  </article>
                </div>
              ) : (
                <EmptyState to="/admin/results" action="Result imports">
                  GPA quality checks are unavailable right now.
                </EmptyState>
              )}

              {gradeRows.length ? (
                <div className="intel-grades">
                  <h4 className="intel-attention__title">Official result codes in use</h4>
                  <ul className="grade-bars">
                    {gradeRows.slice(0, 8).map((row) => {
                      const max = Math.max(...gradeRows.map((item) => asNumber(item.count)), 1);
                      const width = `${Math.max(8, Math.round((asNumber(row.count) / max) * 100))}%`;
                      return (
                        <li key={row.resultCode}>
                          <span className="grade-bars__code">{row.resultCode}</span>
                          <span className="grade-bars__track" aria-hidden="true">
                            <span className="grade-bars__fill" style={{ width }} />
                          </span>
                          <span className="grade-bars__count">{row.count}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {qualityNeedsAttention ? (
                <p className="intel-note" role="status">
                  Data quality: one or more GPA snapshot signals need review before department
                  averages can be trusted.
                </p>
              ) : null}
            </div>
          </>
        ) : extras.intelligencePending ? (
          <p className="deadline-empty">Loading department academic intelligence…</p>
        ) : (
          <EmptyState to="/admin/results" action="Result imports">
            Academic intelligence is unavailable right now. Large departments may time out on
            quality scans; operational cards above remain authoritative.
          </EmptyState>
        )}

        <p className="panel-footnote">
          <Link to="/admin/results">Result imports</Link>
          <span className="panel-footnote__sep">·</span>
          <Link to="/admin/ca">CA recovery</Link>
        </p>
      </Panel>
    </section>
  );
}
