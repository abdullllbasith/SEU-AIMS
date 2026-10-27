import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from './admin-api.js';
import { AccountActions } from './AccountActions.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { StatCard } from '../../ui/StatCard.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';

export function AdminLecturerDetailPage() {
  const { userId } = useParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminApi
      .lecturer(userId)
      .then((response) => {
        if (!cancelled) {
          setData(response.data);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load lecturer');
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
  }, [userId]);

  if (loading) {
    return <PageSkeleton title="Lecturer overview" variant="detail" stats={4} />;
  }

  const assignments = data?.assignments || [];
  const activeCount = assignments.filter((row) => row.isActive).length;

  return (
    <section className="record-page">
      <PageHeader
        title="Lecturer overview"
        purpose="Lecturer account and assignments."
        actions={
          <Link className="text-action" to="/admin/people">
            Back to people
          </Link>
        }
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {data ? (
        <>
          <div className="stat-row">
            <StatCard label="Lecturer status" value={data.lecturerStatus || '—'} />
            <StatCard label="Account" value={data.accountStatus || '—'} />
            <StatCard label="Active assignments" value={activeCount} />
            <StatCard label="Total listed" value={assignments.length} />
          </div>

          <Panel title="Identity" kicker={data.displayName}>
            <dl className="record-dl record-dl--inline">
              <div>
                <dt>Display name</dt>
                <dd>{data.displayName}</dd>
              </div>
              <div>
                <dt>Lecturer status</dt>
                <dd>
                  <span
                    className={
                      data.lecturerStatus === 'VERIFIED'
                        ? 'status-pill status-pill--ok'
                        : 'status-pill status-pill--pending'
                    }
                  >
                    {data.lecturerStatus}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{data.email}</dd>
              </div>
              <div>
                <dt>Account status</dt>
                <dd>
                  <span className="status-pill">{data.accountStatus}</span>
                </dd>
              </div>
            </dl>
          </Panel>

          <AccountActions
            key={userId}
            userId={userId}
            email={data.email}
            accountStatus={data.accountStatus}
            onStatusChange={(accountStatus) => setData((current) => ({ ...current, accountStatus }))}
          />

          <Panel title="Assignments" kicker={`${assignments.length} listed`}>
            {assignments.length === 0 ? (
              <p className="deadline-empty">No assignments listed for this lecturer.</p>
            ) : (
              <ul className="stack-list">
                {assignments.map((row) => (
                  <li key={row.assignmentId}>
                    <span className="stack-item__title">{row.subjectCode}</span>
                    <span className="stack-item__meta">
                      {row.isActive ? (
                        <span className="status-pill status-pill--ok">Active</span>
                      ) : (
                        <span className="status-pill">Inactive</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="panel-footnote">
              <Link to="/admin/academic">Manage on Academic admin</Link>
              <span className="panel-footnote__sep">·</span>
              <Link to="/admin/offerings-health">Offering health</Link>
            </p>
          </Panel>
        </>
      ) : null}
    </section>
  );
}
