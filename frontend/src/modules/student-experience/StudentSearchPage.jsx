import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { experienceApi } from './experience-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';

export function StudentSearchPage() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearching(true);
      experienceApi
        .search(query)
        .then((body) => {
          setError('');
          setData(body.data);
        })
        .catch((caught) => {
          setError(caught.message || 'Search failed');
          setData(null);
        })
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  const hasResults = Boolean(data?.offerings?.length || data?.resources?.length);
  const showEmpty = data && !hasResults;

  return (
    <section className="record-page">
      <PageHeader
        title="Search official learning content"
        purpose="Searches your authorized subject offerings and published official resources only. Study Room files are excluded."
      />

      <div className="filter-bar filter-bar--search">
        <label>
          Subject code, name, or resource title
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={64}
            placeholder="e.g. CSC2101 or lecture notes"
            autoComplete="off"
            autoFocus
          />
        </label>
        {searching ? <p className="filter-bar__hint">Searching…</p> : null}
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {showEmpty ? (
        <EmptyState to="/learning" action="Browse official resources">
          {query.trim()
            ? 'No matching official subjects or resources.'
            : 'Type a subject code, name, or resource title to search.'}
        </EmptyState>
      ) : null}

      {data?.offerings?.length ? (
        <Panel title="Subjects" kicker={`${data.offerings.length} match${data.offerings.length === 1 ? '' : 'es'}`}>
          <ul className="entity-list">
            {data.offerings.map((item) => (
              <li key={item.id}>
                <Link className="offering-card" to={item.learningPath}>
                  <p className="offering-card__code">
                    {item.subjectCode}{' '}
                    <span className="offering-card__name">{item.subjectName}</span>
                  </p>
                  <p className="offering-card__meta">Open offering materials</p>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {data?.resources?.length ? (
        <Panel
          title="Official resources"
          kicker={`${data.resources.length} match${data.resources.length === 1 ? '' : 'es'}`}
        >
          <ul className="stack-list">
            {data.resources.map((item) => (
              <li key={item.id}>
                <Link to={item.learningPath}>
                  <span className="stack-item__title">
                    {item.subjectCode}: {item.title}
                  </span>
                  <span className="stack-item__meta">Published official resource</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </section>
  );
}
