import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { learningApi } from '../learning/learning-api.js';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';

export function AdminResourcesPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState('');

  async function reload() {
    const response = await learningApi.adminResources({ publicationState: 'ALL' });
    setItems(response.data.items);
  }

  useEffect(() => {
    let cancelled = false;
    reload()
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load resources');
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
    return <PageSkeleton title="Official resource oversight" variant="list" />;
  }

  return (
    <section className="admin-page record-page">
      <PageHeader
        title="Official resource oversight"
        purpose="Department-wide view of official course files. Unpublish removes student visibility without deleting history."
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

      <Panel title="Resources" kicker={`${items.length} file${items.length === 1 ? '' : 's'}`}>
        {items.length === 0 ? (
          <EmptyState to="/admin/academic" action="Academic admin">
            No official resources in this department.
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>State</th>
                  <th>Scan</th>
                  <th>Offering</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.title}</td>
                    <td>
                      <span
                        className={
                          item.publicationState === 'PUBLISHED'
                            ? 'status-pill status-pill--ok'
                            : 'status-pill'
                        }
                      >
                        {item.publicationState}
                      </span>
                    </td>
                    <td>{item.scanStatus}</td>
                    <td>
                      <Link to={`/learning/offerings/${item.subjectOfferingId}`}>Open offering</Link>
                    </td>
                    <td>
                      {item.publicationState === 'PUBLISHED' ? (
                        <ActionButton
                          busy={busyId === item.id}
                          busyLabel="Unpublishing…"
                          onClick={() => {
                            if (!window.confirm('Unpublish this resource from students?')) {
                              return;
                            }
                            setBusyId(item.id);
                            learningApi
                              .unpublish(item.id)
                              .then(reload)
                              .catch((caught) => setError(caught.message))
                              .finally(() => setBusyId(''));
                          }}
                        >
                          Unpublish
                        </ActionButton>
                      ) : (
                        <span className="deadline-empty">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </section>
  );
}
