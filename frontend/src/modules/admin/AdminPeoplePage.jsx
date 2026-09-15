import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from './admin-api.js';

export function AdminPeoplePage() {
  const [tab, setTab] = useState('students');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [students, setStudents] = useState(null);
  const [lecturers, setLecturers] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = tab === 'students' ? adminApi.students({ q: query }) : adminApi.lecturers({ q: query });
    load
      .then((response) => {
        if (cancelled) {
          return;
        }
        if (tab === 'students') {
          setStudents(response.data);
        } else {
          setLecturers(response.data);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load directory');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab, query]);

  return (
    <section>
      <h1>People</h1>
      <p>Prefix search only. Pattern characters are rejected. Phone numbers are omitted.</p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <p>
        <button type="button" onClick={() => setTab('students')}>
          Students
        </button>
        <button type="button" onClick={() => setTab('lecturers')}>
          Lecturers
        </button>
      </p>
      <label>
        Search
        <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={64} />
      </label>
      {tab === 'students' && students ? (
        <ul>
          {students.items.map((row) => (
            <li key={row.userId}>
              <Link to={`/admin/people/students/${row.userId}`}>
                {row.registrationNumber} — {row.displayName}
              </Link>
              {` (${row.accountStatus}, open E(CA) ${row.unresolvedEcaCount})`}
            </li>
          ))}
        </ul>
      ) : null}
      {tab === 'lecturers' && lecturers ? (
        <ul>
          {lecturers.items.map((row) => (
            <li key={row.userId}>
              <Link to={`/admin/people/lecturers/${row.userId}`}>
                {row.displayName} — {row.lecturerStatus}
              </Link>
              {` (active assignments ${row.activeAssignmentCount})`}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
