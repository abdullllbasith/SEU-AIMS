import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from './admin-api.js';
import { apiRequest } from '../../services/api-client.js';

export function AdminObservabilityPage() {
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [ops, setOps] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [notify, setNotify] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [files, setFiles] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiRequest('/audit/summary'),
      apiRequest('/ops/metrics'),
      apiRequest('/ops/integrity'),
      adminApi.jobs(),
      adminApi.notificationHealth(),
      adminApi.calendarHealth(),
    ])
      .then(([audit, metrics, integrity, jobPayload, notification, cal]) => {
        if (!cancelled) {
          setSummary(audit.data);
          setOps({ ...metrics.data, integrity: integrity.data });
          setJobs(jobPayload.data);
          setNotify(notification.data);
          setCalendar(cal.data);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load operational summary');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <h1>Operational summary</h1>
      <p>Counts only. This view does not show student names, results, or chat content.</p>
      <p>
        <Link to="/admin">Department dashboard</Link>
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {summary ? (
        <dl>
          <dt>Denied audit events</dt>
          <dd>{summary.denied}</dd>
        </dl>
      ) : null}
      {ops?.queue ? (
        <p>
          Queue adapter {ops.queue.adapter}. Depth {ops.queue.depth ?? 'n/a'}. Failed{' '}
          {ops.queue.failed}.
        </p>
      ) : null}
      {jobs?.retry ? <p>{jobs.retry.reason}</p> : null}
      {ops?.integrity ? (
        <p>
          Integrity issues {ops.integrity.issueCount}. Diagnostic only; this view does not repair
          records.
        </p>
      ) : null}
      {notify ? (
        <p>
          Notification groups {notify.byStatusAndChannel.length}. Recent failures{' '}
          {notify.recentFailures.length}.
        </p>
      ) : null}
      <p>
        <button
          type="button"
          onClick={() =>
            apiRequest('/files/admin/reconciliation')
              .then((response) => setFiles(response.data))
              .catch((caught) => setError(caught.message || 'Unable to check stored files'))
          }
        >
          Check stored files
        </button>
      </p>
      {files ? (
        <p>
          Stored-file issues {files.issueCount}. {files.note}
        </p>
      ) : null}
      {calendar ? (
        <p>
          Upcoming published events {calendar.upcomingPublishedEvents}. Draft notices{' '}
          {calendar.draftNotices}.
        </p>
      ) : null}
    </section>
  );
}
