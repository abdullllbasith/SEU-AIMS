import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from './admin-api.js';
import { AccountActions } from './AccountActions.jsx';
import { StudentEnrollmentsPanel } from './enrollment-admin.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { StatCard } from '../../ui/StatCard.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';

export function AdminStudentDetailPage() {
  const { userId } = useParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminApi
      .student(userId)
      .then((response) => {
        if (!cancelled) {
          setData(response.data);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load student');
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
    return <PageSkeleton title="Student overview" variant="detail" stats={4} />;
  }

  return (
    <section className="record-page">
      <PageHeader
        title="Student overview"
        purpose="Student account and academic record."
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
            <StatCard label="Registration" value={data.registrationNumber || '—'} />
            <StatCard label="Account" value={data.accountStatus || '—'} />
            <StatCard label="Open E(CA)" value={data.unresolvedEcaCount ?? 0} to="/admin/ca" />
            <StatCard
              label="GPA"
              value={data.gpa?.gpa ?? 'n/a'}
              hint={`${data.gpa?.status || '—'} · ${data.gpa?.engine || ''}`}
            />
          </div>

          <Panel title="Identity" kicker={data.displayName}>
            <dl className="record-dl record-dl--inline">
              <div>
                <dt>Display name</dt>
                <dd>{data.displayName}</dd>
              </div>
              <div>
                <dt>Registration number</dt>
                <dd>{data.registrationNumber}</dd>
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

          <Panel title="Results" kicker={`${(data.results || []).length} row${(data.results || []).length === 1 ? '' : 's'}`}>
            {(data.results || []).length === 0 ? (
              <p className="deadline-empty">No composed results for this student.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Result</th>
                      <th>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((row) => (
                      <tr key={row.subjectCode}>
                        <td>
                          <span className="result-subject">{row.subjectCode}</span>
                        </td>
                        <td>
                          <span className={row.isEca ? 'result-mark result-mark--eca' : 'result-mark'}>
                            {row.resultCode}
                          </span>
                        </td>
                        <td>{row.isEca ? 'E(CA)' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="panel-footnote">
              <Link to="/admin/results">Result imports</Link>
              <span className="panel-footnote__sep">·</span>
              <Link to="/admin/ca">CA recovery</Link>
            </p>
          </Panel>
          <StudentEnrollmentsPanel userId={userId} registrationNumber={data.registrationNumber} />
        </>
      ) : null}
    </section>
  );
}
