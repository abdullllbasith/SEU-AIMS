import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from './admin-api.js';

export function AdminOfferingHealthPage() {
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .offerings()
      .then((response) => {
        if (!cancelled) {
          setData(response.data);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load offerings');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <h1>Subject offering health</h1>
      <p>
        Unassigned and multiple-lecturer flags are counts, not correctness judgments. Manage
        structure on Academic admin.
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <p>
        <Link to="/admin/academic">Academic structure</Link>
      </p>
      {data ? (
        <ul>
          {data.items.map((row) => (
            <li key={row.subjectOfferingId}>
              {row.subjectCode} {row.batchCode} {row.semester} — lecturers {row.activeLecturerCount}
              {row.unassigned ? ' (no active lecturer)' : ''}
              {row.multipleLecturers ? ' (multiple lecturers)' : ''} — published resources{' '}
              {row.publishedOfficialResources}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
