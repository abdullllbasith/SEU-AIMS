import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { experienceApi, formatGpaDisplay } from './experience-api.js';

export function PerformancePage() {
  const [state, setState] = useState({ loading: true, error: '', data: null });

  useEffect(() => {
    let cancelled = false;
    experienceApi
      .performance()
      .then((body) => {
        if (!cancelled) {
          setState({ loading: false, error: '', data: body.data });
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setState({ loading: false, error: caught.message || 'Unable to load performance', data: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return <p>Loading performance…</p>;
  }
  if (state.error) {
    return <p className="form-error">{state.error}</p>;
  }

  const data = state.data;
  const maxCount = Math.max(1, ...data.distribution.map((item) => item.count));

  return (
    <section>
      <h1>My performance</h1>
      <p>{formatGpaDisplay(data.gpa)}</p>
      {data.gpa.available ? (
        <p>
          Credits counted: {data.gpa.credits}. Classification: {data.gpa.classification || '—'}.
        </p>
      ) : null}
      <p>
        Completed official results: {data.completedCount}. Pending E(CA): {data.pendingEcaCount}.
        {data.pendingEcaCount ? (
          <>
            {' '}
            <Link to="/ca">Open CA recovery</Link>
          </>
        ) : null}
      </p>

      <h2>Semester GPA trend</h2>
      {data.trend.length === 0 ? <p>Not enough semester calculations yet.</p> : null}
      <table className="data-table">
        <caption>GPA by semester from the official calculation service</caption>
        <thead>
          <tr>
            <th>Semester</th>
            <th>GPA</th>
            <th>Credits</th>
          </tr>
        </thead>
        <tbody>
          {data.trend.map((item) => (
            <tr key={`${item.academicYearId}-${item.semesterId}`}>
              <td>{item.semesterId}</td>
              <td>{item.gpa}</td>
              <td>{item.credits}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Result distribution</h2>
      {data.distribution.length === 0 ? <p>Official results are not available for this semester yet.</p> : null}
      <ul className="bar-chart" aria-label="Result distribution">
        {data.distribution.map((item) => (
          <li key={item.resultCode}>
            <span>{item.resultCode}</span>
            <span className="bar-chart__track">
              <span className="bar-chart__fill" style={{ width: `${(item.count / maxCount) * 100}%` }} />
            </span>
            <span>{item.count}</span>
          </li>
        ))}
      </ul>

      <h2>Subject results</h2>
      <div className="table-scroll">
        <table className="data-table">
          <caption>Subject-level official results</caption>
          <thead>
            <tr>
              <th>Subject</th>
              <th>Credits</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {data.subjects.map((item) => (
              <tr key={`${item.subjectCode}-${item.semesterId}`}>
                <td>
                  {item.subjectCode} {item.subjectName}
                </td>
                <td>{item.credits ?? '—'}</td>
                <td>
                  {item.resultCode}
                  {item.isEca ? ' (incomplete CA)' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
