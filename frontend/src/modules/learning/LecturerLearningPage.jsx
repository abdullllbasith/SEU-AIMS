import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { learningApi } from './learning-api.js';

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
    return <p>Loading assigned offerings…</p>;
  }
  if (error) {
    return <p className="form-error">{error}</p>;
  }

  return (
    <section>
      <h1>Official resources</h1>
      <p>Manage materials only for subject offerings assigned to you.</p>
      {items.length === 0 ? <p>You have no active assignments.</p> : null}
      <ul className="entity-list">
        {items.map((item) => (
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
