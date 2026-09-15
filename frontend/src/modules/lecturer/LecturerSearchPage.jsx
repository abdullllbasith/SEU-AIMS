import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { lecturerApi } from './lecturer-api.js';

export function LecturerSearchPage() {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      lecturerApi
        .search(query)
        .then((body) => {
          setError('');
          setData(body.data);
        })
        .catch((caught) => {
          setError(caught.message || 'Search failed');
          setData(null);
        });
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  const empty =
    data &&
    !data.offerings?.length &&
    !data.resources?.length &&
    !data.events?.length &&
    !data.caStudents?.length &&
    !data.sections?.length;

  return (
    <section>
      <h1>Search assigned teaching content</h1>
      <p>
        Searches your assigned subject offerings, official resources, offering calendar events, and CA
        registration numbers you may schedule. Study Room and GPA are excluded.
      </p>
      <label>
        Subject, resource title, event, or CA registration number
        <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={64} />
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {empty ? <p>No matches in your assignment scope.</p> : null}
      {data?.offerings?.length ? (
        <>
          <h2>Subject offerings</h2>
          <ul>
            {data.offerings.map((item) => (
              <li key={item.id}>
                <Link to={item.workspacePath}>
                  {item.subjectCode} {item.subjectName}
                </Link>
                {item.canManage ? '' : ' (read-only)'}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {data?.resources?.length ? (
        <>
          <h2>Official resources</h2>
          <ul>
            {data.resources.map((item) => (
              <li key={item.id}>
                <Link to={item.learningPath}>
                  {item.subjectCode}: {item.title} ({item.publicationState})
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {data?.events?.length ? (
        <>
          <h2>Calendar</h2>
          <ul>
            {data.events.map((item) => (
              <li key={item.id}>
                <Link to="/calendar">{item.title}</Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {data?.caStudents?.length ? (
        <>
          <h2>CA students (registration numbers)</h2>
          <ul>
            {data.caStudents.map((item) => (
              <li key={`${item.applicationId}-${item.subjectOfferingId}`}>
                <Link to="/lecturer/ca">
                  {item.registrationNumber} — {item.applicationId}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
