import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from './admin-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { Skeleton, SkeletonLine } from '../../ui/Skeleton.jsx';

function PeoplePager({ page, pageSize, total, onPage }) {
  const last = Math.max(1, Math.ceil((total || 0) / (pageSize || 20)));
  return (
    <div className="pager">
      <span className="pager__meta">
        Showing {Math.min(total, (page - 1) * pageSize + 1)}–
        {Math.min(total, page * pageSize)} of {total}
      </span>
      <span className="stack-item__actions">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button type="button" disabled={page >= last} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </span>
    </div>
  );
}

export function AdminPeoplePage() {
  const [tab, setTab] = useState('students');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState(null);
  const [lecturers, setLecturers] = useState(null);

  useEffect(() => {
    setPage(1);
  }, [tab, query]);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      setError('');
      const params = { q: query, page, pageSize: 20 };
      const load = tab === 'students' ? adminApi.students(params) : adminApi.lecturers(params);
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
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [tab, query, page]);

  const studentItems = students?.items || [];
  const lecturerItems = lecturers?.items || [];
  const active = tab === 'students' ? students : lecturers;

  return (
    <section className="record-page">
      <PageHeader
        title="People"
        purpose="Students and lecturers in this department."
      />

      <nav className="tab-nav" aria-label="People directory">
        <button
          type="button"
          className={tab === 'students' ? 'is-active' : ''}
          onClick={() => setTab('students')}
        >
          Students
        </button>
        <button
          type="button"
          className={tab === 'lecturers' ? 'is-active' : ''}
          onClick={() => setTab('lecturers')}
        >
          Lecturers
        </button>
      </nav>

      <div className="filter-bar filter-bar--search">
        <label>
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={64}
            placeholder={tab === 'students' ? 'Name or registration number' : 'Display name'}
            autoComplete="off"
          />
        </label>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <Panel title={tab === 'students' ? 'Students' : 'Lecturers'} kicker="Loading">
          <div className="skeleton-list" aria-busy="true" aria-label="Loading directory">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="skeleton-list__row">
                <Skeleton width="2rem" height="2rem" radius="999px" />
                <div className="skeleton-list__copy">
                  <SkeletonLine width="48%" />
                  <SkeletonLine width="68%" />
                </div>
                <Skeleton width="4.5rem" height="1.8rem" radius="0.4rem" />
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {tab === 'students' && !loading ? (
        <Panel title="Students" kicker={`${students?.total ?? 0} total`}>
          {studentItems.length === 0 ? (
            <EmptyState to="/admin/academic" action="Academic admin">
              No students match this search.
            </EmptyState>
          ) : (
            <ul className="entity-list">
              {studentItems.map((row) => (
                <li key={row.userId}>
                  <Link className="offering-card" to={`/admin/people/students/${row.userId}`}>
                    <p className="offering-card__code">
                      {row.registrationNumber}{' '}
                      <span className="offering-card__name">{row.displayName}</span>
                    </p>
                    <p className="offering-card__meta">
                      <span className="status-pill">{row.accountStatus}</span>
                      <span className="panel-footnote__sep">·</span>
                      Open E(CA) {row.unresolvedEcaCount}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {active ? (
            <PeoplePager
              page={active.page || page}
              pageSize={active.pageSize || 20}
              total={active.total || 0}
              onPage={setPage}
            />
          ) : null}
        </Panel>
      ) : null}

      {tab === 'lecturers' && !loading ? (
        <Panel title="Lecturers" kicker={`${lecturers?.total ?? 0} total`}>
          {lecturerItems.length === 0 ? (
            <EmptyState to="/admin/academic" action="Academic admin">
              No lecturers match this search.
            </EmptyState>
          ) : (
            <ul className="entity-list">
              {lecturerItems.map((row) => (
                <li key={row.userId}>
                  <Link className="offering-card" to={`/admin/people/lecturers/${row.userId}`}>
                    <p className="offering-card__code">
                      {row.displayName}{' '}
                      <span className="offering-card__name">{row.lecturerStatus}</span>
                    </p>
                    <p className="offering-card__meta">
                      <span className="status-pill">{row.accountStatus}</span>
                      <span className="panel-footnote__sep">·</span>
                      Active assignments {row.activeAssignmentCount}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {active ? (
            <PeoplePager
              page={active.page || page}
              pageSize={active.pageSize || 20}
              total={active.total || 0}
              onPage={setPage}
            />
          ) : null}
        </Panel>
      ) : null}
    </section>
  );
}
