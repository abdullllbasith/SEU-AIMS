import { useEffect, useState } from 'react';
import { gpaApi, resultsApi } from './results-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import { formatSemesterLabel } from '../../ui/academic-labels.js';

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

  const periods = resultPeriods(results);
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

      {periods.length === 0 ? (
        <Panel title="Subject results">
          <EmptyState to="/academic/me" action="Open academic context">
            No official results yet.
          </EmptyState>
        </Panel>
      ) : (
        periods.map((period) => (
          <Panel
            key={`${period.academicYearId}-${period.semesterId}`}
            title={periodTitle(period)}
            kicker={`${period.results.length} result${period.results.length === 1 ? '' : 's'}${period.current ? ' · current semester' : ''}`}
          >
            <ResultCards rows={period.results} />
            <div className="table-scroll">
              <ResultTable rows={period.results} />
            </div>
          </Panel>
        ))
      )}
    </section>
  );
}

function resultPeriods(results) {
  if (Array.isArray(results?.periods) && results.periods.length) {
    return results.periods;
  }
  const current = results?.current || [];
  const history = results?.history || [];
  return [
    current.length
      ? { academicYearId: 'current', semesterId: 'current', academicYearName: 'Current semester', results: current, current: true }
      : null,
    history.length
      ? { academicYearId: 'history', semesterId: 'history', academicYearName: 'Earlier results', results: history, current: false }
      : null,
  ].filter(Boolean);
}

function periodTitle(period) {
  return (
    formatSemesterLabel(
      { name: period.semesterName, sequence: period.semesterSequence },
      { name: period.academicYearName, sequence: period.academicYearSequence },
    ) || 'Semester'
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
