import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, studentsCsvUrl } from './admin-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { StatCard } from '../../ui/StatCard.jsx';

const CARD_LABELS = {
  activeStudents: 'Active students',
  activeLecturers: 'Active lecturers',
  activeBatches: 'Active batches',
  activeSemesters: 'Active semesters',
  activeSubjectOfferings: 'Active subject offerings',
  unpublishedOfficialResources: 'Unpublished official resources',
  pendingResultImports: 'Pending result imports',
  unresolvedEcaConditions: 'Unresolved E(CA) conditions',
  pendingCaApplications: 'Pending CA applications',
  upcomingCaAssessments: 'Upcoming CA assessments',
  failedNotifications: 'Failed notifications',
  failedBackgroundJobs: 'Failed background jobs',
  deniedAuditEvents: 'Denied audit events',
};

export function AdminDashboardPage() {
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .dashboard()
      .then((response) => {
        if (!cancelled) {
          setData(response.data);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load dashboard');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <PageHeader
        title="Department operations"
        purpose="Derived counts from authoritative modules. This page does not edit results, grades, or Study Room chat. Queue failed-job counts are platform-wide, not department-split."
        meta={data?.computedAt ? `Computed ${data.computedAt}` : null}
      />
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {data?.cards ? (
        <div className="stat-row">
          <StatCard label="Active students" value={data.cards.activeStudents} to="/admin/people" />
          <StatCard label="Active lecturers" value={data.cards.activeLecturers} to="/admin/people" />
          <StatCard label="Active offerings" value={data.cards.activeSubjectOfferings} to="/admin/offerings-health" />
          <StatCard label="Pending result imports" value={data.cards.pendingResultImports} to="/admin/results" />
          <StatCard label="Unresolved E(CA)" value={data.cards.unresolvedEcaConditions} to="/admin/ca" />
          <StatCard label="Pending CA applications" value={data.cards.pendingCaApplications} to="/admin/ca" />
        </div>
      ) : (
        <p className="empty-state">Loading counts…</p>
      )}
      <div className="dashboard-grid">
        <Panel title="Further operational counts">
          {data?.cards ? (
            <table className="count-table">
              <tbody>
                {Object.entries(CARD_LABELS)
                  .filter(
                    ([key]) =>
                      ![
                        'activeStudents',
                        'activeLecturers',
                        'activeSubjectOfferings',
                        'pendingResultImports',
                        'unresolvedEcaConditions',
                        'pendingCaApplications',
                      ].includes(key),
                  )
                  .map(([key, label]) => (
                    <tr key={key}>
                      <th scope="row">{label}</th>
                      <td>{data.cards[key]}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : null}
        </Panel>
        <Panel title="Open a module">
          <ul className="module-links">
            <li>
              <Link to="/admin/people">Students and lecturers</Link>
            </li>
            <li>
              <Link to="/admin/offerings-health">Subject offering health</Link>
            </li>
            <li>
              <Link to="/admin/results">Result imports (commit here)</Link>
            </li>
            <li>
              <Link to="/admin/ca">CA Recovery actions</Link>
            </li>
            <li>
              <Link to="/admin/ops">Queue, integrity, audit counts</Link>
            </li>
            <li>
              <a href={studentsCsvUrl()}>Download student directory CSV</a>
            </li>
          </ul>
        </Panel>
      </div>
    </section>
  );
}
