import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, studentsCsvUrl } from './admin-api.js';

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
      <h1>Department operations</h1>
      <p>
        Derived counts from authoritative modules. This page does not edit results, grades, or Study
        Room chat. Queue failed-job counts are platform-wide, not department-split.
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {data?.computedAt ? <p>Computed {data.computedAt}</p> : null}
      {data?.cards ? (
        <dl>
          {Object.entries(CARD_LABELS).map(([key, label]) => (
            <span key={key}>
              <dt>{label}</dt>
              <dd>{data.cards[key]}</dd>
            </span>
          ))}
        </dl>
      ) : null}
      <nav>
        <ul>
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
      </nav>
    </section>
  );
}
