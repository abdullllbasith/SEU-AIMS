import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { learningApi } from './learning-api.js';

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
    return <p>Loading current semester…</p>;
  }
  if (error) {
    return <p className="form-error">{error}</p>;
  }

  const visibleCurrent = current.filter((item) => {
    const hay = `${item.subjectCode} ${item.subjectName}`.toLowerCase();
    return !filter.trim() || hay.includes(filter.trim().toLowerCase());
  });

  return (
    <section>
      <h1>Official learning resources</h1>
      <p>
        Course materials for your current semester from the learning environment. Historical offerings stay
        available below. This is not the Student Study Room.
      </p>
      <label>
        Filter current subjects
        <input value={filter} onChange={(event) => setFilter(event.target.value)} />
      </label>
      <h2>Current semester</h2>
      {visibleCurrent.length === 0 ? <p>No subject offerings match this filter.</p> : null}
      <ul className="entity-list">
        {visibleCurrent.map((item) => (
          <li key={item.id}>
            <Link to={`/learning/offerings/${item.id}`}>
              {item.subjectCode} — {item.subjectName}
            </Link>
          </li>
        ))}
      </ul>
      <h2>Academic history</h2>
      {history.length === 0 ? <p>No historical offerings recorded yet.</p> : null}
      <ul className="entity-list">
        {history.map((item) => (
          <li key={item.id}>
            <Link to={`/learning/offerings/${item.id}`}>
              {item.subjectCode} — {item.subjectName}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
