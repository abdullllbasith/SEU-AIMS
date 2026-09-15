import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from './admin-api.js';

export function AdminStudentDetailPage() {
  const { userId } = useParams();
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
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
      <h1>Student overview</h1>
      <p>Read-only composition. Official result edits stay on result import.</p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {data ? (
        <>
          <p>
            {data.registrationNumber} — {data.displayName} ({data.accountStatus})
          </p>
          <p>Open E(CA) conditions: {data.unresolvedEcaCount}</p>
          <p>
            GPA snapshot: {data.gpa?.status} {data.gpa?.gpa ?? 'n/a'} ({data.gpa?.engine})
          </p>
          <h2>Results</h2>
          <ul>
            {data.results.map((row) => (
              <li key={row.subjectCode}>
                {row.subjectCode} {row.resultCode}
                {row.isEca ? ' E(CA)' : ''}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
