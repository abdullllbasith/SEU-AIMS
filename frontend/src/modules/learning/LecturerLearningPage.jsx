import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { learningApi } from './learning-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';

export function LecturerLearningPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    learningApi
      .offerings()
      .then((response) => {
        if (!cancelled) {
          setItems(response.data.items);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load assigned offerings');
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
    return <PageSkeleton title="Official resources" variant="list" />;
  }

  if (error) {
    return (
      <section className="record-page">
        <PageHeader title="Official resources" />
        <p className="form-error" role="alert">
          {error}
        </p>
      </section>
    );
  }

  return (
    <section className="record-page">
      <PageHeader
        title="Official resources"
        purpose="Materials for your assigned offerings."
      />

      <Panel title="Assigned offerings" kicker={`${items.length} offering${items.length === 1 ? '' : 's'}`}>
        {items.length === 0 ? (
          <EmptyState to="/lecturer/offerings" action="View assignments">
            You have no active assignments.
          </EmptyState>
        ) : (
          <ul className="entity-list">
            {items.map((item) => (
              <li key={item.id}>
                <Link className="offering-card" to={`/learning/offerings/${item.id}`}>
                  <p className="offering-card__code">
                    {item.subjectCode}{' '}
                    <span className="offering-card__name">{item.subjectName}</span>
                  </p>
                  <p className="offering-card__meta">Open resource manager · upload, publish, archive</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="panel-footnote">
          <Link to="/lecturer/offerings">Full assignment list</Link>
          <span className="panel-footnote__sep">·</span>
          <Link to="/lecturer/search">Search assigned content</Link>
        </p>
      </Panel>
    </section>
  );
}
