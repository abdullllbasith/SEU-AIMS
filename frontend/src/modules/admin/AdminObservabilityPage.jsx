import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from './admin-api.js';
import { apiRequest } from '../../services/api-client.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { StatCard } from '../../ui/StatCard.jsx';

function queueDepthLabel(depth) {
  if (depth == null || depth === '') {
    return 'n/a';
  }
  if (typeof depth !== 'object') {
    return depth;
  }
  const parts = ['high', 'normal', 'low']
    .filter((key) => depth[key] != null)
    .map((key) => `${key} ${depth[key]}`);
  return parts.length ? parts.join(' · ') : 'n/a';
}
import { PageSkeleton } from '../../ui/Skeleton.jsx';

export function AdminObservabilityPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
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
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <PageSkeleton title="Operational summary" variant="detail" stats={4} />;
  }

  return (
    <section className="record-page">
      <PageHeader
        title="Operational summary"
        purpose="Counts only. This view does not show student names, results, or chat content. Queue failed-job counts may be platform-wide."
        actions={
          <Link className="text-action" to="/admin">
            Department dashboard
          </Link>
        }
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="stat-row">
        <StatCard label="Denied audits" value={summary?.denied ?? '—'} icon="attention" tone="alert" />
        <StatCard label="Queue failed" value={ops?.queue?.failed ?? '—'} icon="ops" tone="alert" />
        <StatCard label="Integrity issues" value={ops?.integrity?.issueCount ?? '—'} icon="health" tone="watch" />
        <StatCard
          label="Upcoming events"
          value={calendar?.upcomingPublishedEvents ?? '—'}
          icon="semesters"
        />
      </div>

      <div className="ops-console-grid">
        <Panel title="Queue & jobs" kicker={ops?.queue?.adapter || 'adapter'}>
          <dl className="record-dl record-dl--inline">
            <div>
              <dt>Adapter</dt>
              <dd>{ops?.queue?.adapter || '—'}</dd>
            </div>
            <div>
              <dt>Depth</dt>
              <dd>{queueDepthLabel(ops?.queue?.depth)}</dd>
            </div>
            <div>
              <dt>Failed</dt>
              <dd>{ops?.queue?.failed ?? '—'}</dd>
            </div>
            {jobs?.retry?.reason ? (
              <div>
                <dt>Retry note</dt>
                <dd>{jobs.retry.reason}</dd>
              </div>
            ) : null}
          </dl>
        </Panel>

        <Panel title="Integrity & notifications" kicker="Diagnostic">
          <p className="panel-lead">
            Integrity issues: <strong>{ops?.integrity?.issueCount ?? '—'}</strong>. Diagnostic only;
            this view does not repair records.
          </p>
          <dl className="record-dl record-dl--inline">
            <div>
              <dt>Notification groups</dt>
              <dd>{notify?.byStatusAndChannel?.length ?? '—'}</dd>
            </div>
            <div>
              <dt>Recent failures</dt>
              <dd>{notify?.recentFailures?.length ?? '—'}</dd>
            </div>
            <div>
              <dt>Draft notices</dt>
              <dd>{calendar?.draftNotices ?? '—'}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Stored files" kicker="Reconciliation">
          <p className="panel-lead">
            Verify object storage metadata and malware scan consistency across department files.
          </p>
          <div className="panel-actions">
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
          </div>
          {files ? (
            <div className="panel-subsection">
              <p className="panel-lead">
                Stored-file issues <strong>{files.issueCount}</strong>. {files.note}
              </p>
            </div>
          ) : (
            <p className="deadline-empty">Run a check to load stored-file diagnostics.</p>
          )}
        </Panel>
      </div>
    </section>
  );
}
