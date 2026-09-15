import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from './admin-api.js';

export function AdminLecturerDetailPage() {
  const { userId } = useParams();
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
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
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <section>
      <p>
        <Link to="/admin/people">Back to people</Link>
      </p>
      <h1>Lecturer overview</h1>
      <p>Assignment counts only. No workload policy is applied.</p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {data ? (
        <>
          <p>
            {data.displayName} — {data.lecturerStatus} ({data.accountStatus})
          </p>
          <ul>
            {data.assignments.map((row) => (
              <li key={row.assignmentId}>
                {row.subjectCode} {row.isActive ? 'active' : 'inactive'}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
