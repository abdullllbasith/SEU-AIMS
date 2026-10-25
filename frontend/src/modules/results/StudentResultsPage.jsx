import { useEffect, useState } from 'react';
import { gpaApi, resultsApi } from './results-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';

export function StudentResultsPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState(null);
  const [gpa, setGpa] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [resultRes, gpaRes] = await Promise.all([resultsApi.me(), gpaApi.me()]);
        if (!cancelled) {
          setResults(resultRes.data);
          setGpa(gpaRes.data);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught.message || 'Unable to load results');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <PageSkeleton title="My results" variant="list" />;
  }

  if (error) {
    return (
      <section className="record-page">
        <PageHeader title="My results" />
        <p className="form-error" role="alert">
          {error}
        </p>
      </section>
    );
  }

  const current = results?.current || [];
  const history = results?.history || [];
  const gpaReady = gpa && Number(gpa.credits);

  return (
    <section className="record-page results-page">
      <PageHeader
        title="My results"
        purpose="Official marks for your registration."
      />

      {gpaReady ? (
        <div className="results-hero">
          <article className="gpa-hero">
            <p className="gpa-hero__label">CGPA</p>
            <p className="gpa-hero__value">{gpa.cgpa}</p>
            <p className="gpa-hero__class">{gpa.classification}</p>
          </article>
          <article className="gpa-facts">
            <p>
              <span className="gpa-facts__label">Credits counted</span>
              <span className="gpa-facts__value">{gpa.credits}</span>
            </p>
            <p>
              <span className="gpa-facts__label">Engine</span>
              <span className="gpa-facts__value gpa-facts__value--wrap">{gpa.engine}</span>
            </p>
          </article>
        </div>
      ) : (
        <p className="deadline-empty">Performance calculation is not yet available.</p>
      )}

      <Panel title="Current semester" kicker={`${current.length} result${current.length === 1 ? '' : 's'}`}>
        {current.length === 0 ? (
          <EmptyState to="/academic/me" action="Open academic context">
            No official results for the current semester.
          </EmptyState>
        ) : (
          <>
            <ResultCards rows={current} />
            <div className="table-scroll">
              <ResultTable rows={current} />
            </div>
          </>
        )}
      </Panel>

      <Panel title="Academic history" kicker={`${history.length} result${history.length === 1 ? '' : 's'}`}>
        {history.length === 0 ? (
          <p className="deadline-empty">No earlier official results.</p>
        ) : (
          <>
            <ResultCards rows={history} />
            <div className="table-scroll">
              <ResultTable rows={history} />
            </div>
          </>
        )}
      </Panel>
    </section>
  );
}

function ResultCards({ rows }) {
  if (!rows.length) {
    return null;
  }
  return (
    <ul className="result-cards">
      {rows.map((row) => (
        <li key={row.id} className="result-card">
          <p className="result-card__code">{row.subjectCode}</p>
          <p className={resultMarkClass(row)}>{resultLabel(row)}</p>
          <p className="stack-item__meta">
            {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ResultTable({ rows }) {
  if (!rows.length) {
    return null;
  }
  return (
    <table className="data-table result-table">
      <thead>
        <tr>
          <th>Subject</th>
          <th>Result</th>
          <th>Updated</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>
              <span className="result-subject">{row.subjectCode}</span>
            </td>
            <td>
              <span className={resultMarkClass(row)}>{resultLabel(row)}</span>
            </td>
            <td>{row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function resultLabel(row) {
  if (row.isEca) {
    return `${row.resultCode} · incomplete CA`;
  }
  if (row.version > 1) {
    return `${row.resultCode} · updated`;
  }
  return row.resultCode;
}

function resultMarkClass(row) {
  return row.isEca ? 'result-mark result-mark--eca' : 'result-mark';
}
