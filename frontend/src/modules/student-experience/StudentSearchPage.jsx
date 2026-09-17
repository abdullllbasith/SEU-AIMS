import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { experienceApi } from './experience-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';

export function StudentSearchPage() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      experienceApi
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

  return (
    <section>
      <PageHeader
        title="Search official learning content"
        purpose="Searches your authorized subject offerings and published official resources only. Study Room files are excluded."
      />
      <label>
        Subject code, name, or resource title
        <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={64} />
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {data && !data.offerings?.length && !data.resources?.length ? (
        <p>No matching official subjects or resources.</p>
      ) : null}
      {data?.offerings?.length ? (
        <>
          <h2>Subjects</h2>
          <ul className="entity-list">
            {data.offerings.map((item) => (
              <li key={item.id}>
                <Link to={item.learningPath}>
                  {item.subjectCode} {item.subjectName}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {data?.resources?.length ? (
        <>
          <h2>Official resources</h2>
          <ul className="entity-list">
            {data.resources.map((item) => (
              <li key={item.id}>
                <Link to={item.learningPath}>
                  {item.subjectCode}: {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
