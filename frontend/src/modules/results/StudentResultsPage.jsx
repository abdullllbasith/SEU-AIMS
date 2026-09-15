import { useEffect, useState } from 'react';
import { gpaApi, resultsApi } from './results-api.js';

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
    return <p>Loading your academic results…</p>;
  }

  if (error) {
    return <p className="form-error">{error}</p>;
  }

  const current = results?.current || [];
  const history = results?.history || [];

  return (
    <section>
      <h1>My results</h1>
      <h2>GPA / CGPA</h2>
      {!gpa || !Number(gpa.credits) ? <p>Performance calculation is not yet available.</p> : null}
      {gpa && Number(gpa.credits) ? (
        <dl>
          <dt>CGPA</dt>
          <dd>{gpa.cgpa}</dd>
          <dt>Credits counted</dt>
          <dd>{gpa.credits}</dd>
          <dt>Classification</dt>
          <dd>{gpa.classification}</dd>
          <dt>Engine</dt>
          <dd>{gpa.engine}</dd>
        </dl>
      ) : null}
      <p>GPA is calculated on the server from official results. E(CA) is excluded from the average.</p>
      <h2>Current semester</h2>
      {current.length === 0 ? <p>No official results for the current semester.</p> : null}
      <ResultTable rows={current} />
      <h2>Academic history</h2>
      {history.length === 0 ? <p>No earlier official results.</p> : null}
      <ResultTable rows={history} />
    </section>
  );
}

function ResultTable({ rows }) {
  if (!rows.length) {
    return null;
  }
  return (
    <table className="data-table">
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
            <td>{row.subjectCode}</td>
            <td>
              {row.resultCode}
              {row.isEca ? ' (incomplete CA)' : ''}
              {row.version > 1 ? ' (updated)' : ''}
            </td>
            <td>{row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
