import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { learningApi } from './learning-api.js';

export function StudentLearningPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState([]);
  const [history, setHistory] = useState([]);

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

  return (
    <section>
      <h1>Learning</h1>
      <p>Official course materials for your current semester. Historical offerings stay available below.</p>
      <h2>Current semester</h2>
      {current.length === 0 ? <p>No subject offerings in your current semester.</p> : null}
      <ul>
        {current.map((item) => (
          <li key={item.id}>
            <Link to={`/learning/offerings/${item.id}`}>
              {item.subjectCode} — {item.subjectName}
            </Link>
          </li>
        ))}
      </ul>
      <h2>Academic history</h2>
      {history.length === 0 ? <p>No historical offerings recorded yet.</p> : null}
      <ul>
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
