import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { learningApi } from './learning-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';

export function StudentLearningPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState([]);
  const [history, setHistory] = useState([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([learningApi.offerings(), learningApi.offerings({ scope: 'history' })])
      .then(([now, past]) => {
        if (!cancelled) {
          setCurrent(now.data.items);
          setHistory(past.data.items);
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
  }, []);

  if (loading) {
    return <PageSkeleton title="Official learning resources" variant="list" />;
  }

  if (error) {
    return (
      <section className="record-page">
        <PageHeader title="Official learning resources" />
        <p className="form-error" role="alert">
          {error}
        </p>
      </section>
    );
  }

  const visibleCurrent = current.filter((item) => {
    const hay = `${item.subjectCode} ${item.subjectName}`.toLowerCase();
    return !filter.trim() || hay.includes(filter.trim().toLowerCase());
  });

  return (
    <section className="record-page">
      <PageHeader
        title="Official learning resources"
        purpose="Course materials for your current semester from the learning environment. Historical offerings stay available below. This is not the Student Study Room."
      />

      <div className="filter-bar">
        <label>
          Filter current subjects
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Subject code or name"
            autoComplete="off"
          />
        </label>
      </div>

      <Panel title="Current semester" kicker={`${visibleCurrent.length} offering${visibleCurrent.length === 1 ? '' : 's'}`}>
        {visibleCurrent.length === 0 ? (
          <EmptyState to="/academic/me" action="Open academic context">
            No subject offerings match this filter.
          </EmptyState>
        ) : (
          <ul className="entity-list">
            {visibleCurrent.map((item) => (
              <li key={item.id}>
                <Link className="offering-card" to={`/learning/offerings/${item.id}`}>
                  <p className="offering-card__code">
                    {item.subjectCode}{' '}
                    <span className="offering-card__name">{item.subjectName}</span>
                  </p>
                  <p className="offering-card__meta">Open official materials</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Academic history" kicker={`${history.length} offering${history.length === 1 ? '' : 's'}`}>
        {history.length === 0 ? (
          <p className="deadline-empty">No historical offerings recorded yet.</p>
        ) : (
          <ul className="entity-list">
            {history.map((item) => (
              <li key={item.id}>
                <Link className="offering-card" to={`/learning/offerings/${item.id}`}>
                  <p className="offering-card__code">
                    {item.subjectCode}{' '}
                    <span className="offering-card__name">{item.subjectName}</span>
                  </p>
                  <p className="offering-card__meta">Historical offering</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}
