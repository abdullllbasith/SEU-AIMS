import { useEffect, useState } from 'react';
import { apiRequest } from '../../services/api-client.js';

export function AdminObservabilityPage() {
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [ops, setOps] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiRequest('/audit/summary'), apiRequest('/ops/metrics'), apiRequest('/ops/integrity')])
      .then(([audit, metrics, integrity]) => {
        if (!cancelled) {
          setSummary(audit.data);
          setOps({ ...metrics.data, integrity: integrity.data });
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
      {ops?.integrity ? (
        <p>
          Integrity issues {ops.integrity.issueCount}. Diagnostic only; this view does not repair
          records.
        </p>
      ) : null}
    </section>
  );
}
