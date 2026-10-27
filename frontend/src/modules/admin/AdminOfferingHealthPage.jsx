import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from './admin-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';

const PAGE_SIZE = 20;

export function AdminOfferingHealthPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminApi
      .offerings({ page, pageSize: PAGE_SIZE })
      .then((response) => {
        if (!cancelled) {
          setData(response.data);
          setError('');
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load offerings');
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
  }, [page]);

  if (loading && !data) {
    return <PageSkeleton title="Subject offering health" variant="list" />;
  }

  const items = data?.items || [];
  const total = data?.total ?? items.length;
  const pageSize = data?.pageSize || PAGE_SIZE;
  const last = Math.max(1, Math.ceil(total / pageSize));
  const unassigned = items.filter((row) => row.unassigned).length;
  const multi = items.filter((row) => row.multipleLecturers).length;

  return (
    <section className="record-page">
      <PageHeader
        title="Subject offering health"
        purpose="Offering assignment coverage."
        actions={
          <Link className="text-action" to="/admin/academic">
            Academic structure
          </Link>
        }
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <p className="panel-lead">
        <strong>{total}</strong> offerings total
        <span className="panel-footnote__sep">·</span>
        <strong>{unassigned}</strong> without lecturer on this page
        <span className="panel-footnote__sep">·</span>
        <strong>{multi}</strong> with multiple lecturers on this page
      </p>

      <Panel title="Offerings" kicker={`${total} total`}>
        {items.length === 0 ? (
          <EmptyState to="/admin/academic" action="Create offerings">
            No subject offerings to report on.
          </EmptyState>
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Batch</th>
                    <th>Semester</th>
                    <th>Lecturers</th>
                    <th>Flags</th>
                    <th>Published resources</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.subjectOfferingId}>
                      <td>
                        <span className="result-subject">{row.subjectCode}</span>
                      </td>
                      <td>{row.batchCode}</td>
                      <td>{row.semester}</td>
                      <td>{row.activeLecturerCount}</td>
                      <td>
                        {row.unassigned ? (
                          <span className="status-pill status-pill--pending">No lecturer</span>
                        ) : null}{' '}
                        {row.multipleLecturers ? (
                          <span className="status-pill">Multiple</span>
                        ) : null}
                        {!row.unassigned && !row.multipleLecturers ? '—' : null}
                      </td>
                      <td>{row.publishedOfficialResources}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="pager__meta">
                Page {page} of {last} ({total} records)
              </span>
              <span className="stack-item__actions">
                <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= last || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </span>
            </div>
          </>
        )}
      </Panel>
    </section>
  );
}
