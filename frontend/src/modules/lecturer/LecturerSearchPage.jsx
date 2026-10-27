import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { lecturerApi } from './lecturer-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';

export function LecturerSearchPage() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearching(true);
      lecturerApi
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

  const empty =
    data &&
    !data.offerings?.length &&
    !data.resources?.length &&
    !data.events?.length &&
    !data.caStudents?.length &&
    !data.sections?.length;

  return (
    <section className="record-page">
      <PageHeader
        title="Search assigned teaching content"
        purpose="Search your offerings, resources, and calendar."
      />

      <div className="filter-bar filter-bar--search">
        <label>
          Subject, resource title, event, or CA registration number
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={64}
            placeholder="e.g. CSC2101, lecture notes, or SEU/…/…"
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

      {empty ? (
        <EmptyState to="/lecturer/offerings" action="Browse assignments">
          {query.trim()
            ? 'No matches in your assignment scope.'
            : 'Type a subject, resource, event, or registration number to search.'}
        </EmptyState>
      ) : null}

      {data?.offerings?.length ? (
        <Panel
          title="Subject offerings"
          kicker={`${data.offerings.length} match${data.offerings.length === 1 ? '' : 'es'}`}
        >
          <ul className="entity-list">
            {data.offerings.map((item) => (
              <li key={item.id}>
                <Link className="offering-card" to={item.workspacePath}>
                  <p className="offering-card__code">
                    {item.subjectCode}{' '}
                    <span className="offering-card__name">{item.subjectName}</span>
                  </p>
                  <p className="offering-card__meta">
                    {item.canManage ? (
                      <span className="status-pill status-pill--ok">Active</span>
                    ) : (
                      <span className="status-pill">Read-only</span>
                    )}
                  </p>
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
                  <span className="stack-item__meta">{item.publicationState}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {data?.events?.length ? (
        <Panel title="Calendar" kicker={`${data.events.length} event${data.events.length === 1 ? '' : 's'}`}>
          <ul className="stack-list">
            {data.events.map((item) => (
              <li key={item.id}>
                <Link to="/calendar">
                  <span className="stack-item__title">{item.title}</span>
                  <span className="stack-item__meta">Offering calendar event</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {data?.caStudents?.length ? (
        <Panel
          title="CA students"
          kicker={`${data.caStudents.length} registration${data.caStudents.length === 1 ? '' : 's'}`}
        >
          <ul className="stack-list">
            {data.caStudents.map((item) => (
              <li key={`${item.applicationId}-${item.subjectOfferingId}`}>
                <Link to="/lecturer/ca">
                  <span className="stack-item__title">{item.registrationNumber}</span>
                  <span className="stack-item__meta">{item.applicationId}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </section>
  );
}
