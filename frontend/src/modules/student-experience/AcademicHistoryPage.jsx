import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { experienceApi } from './experience-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import { formatSemesterLabel } from '../../ui/academic-labels.js';

export function AcademicHistoryPage() {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [semesterId, setSemesterId] = useState('');

  useEffect(() => {
    let cancelled = false;
    experienceApi
      .history()
      .then((body) => {
        if (!cancelled) {
          setState({ loading: false, error: '', data: body.data });
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setState({ loading: false, error: caught.message || 'Unable to load history', data: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const all = state.data?.results || [];
    if (!semesterId) {
      return all;
    }
    return all.filter((item) => item.semesterId === semesterId);
  }, [state.data, semesterId]);

  if (state.loading) {
    return <PageSkeleton title="Academic history" variant="list" />;
  }

  if (state.error) {
    return (
      <section className="record-page">
        <PageHeader title="Academic history" />
        <p className="form-error" role="alert">
          {state.error}
        </p>
      </section>
    );
  }

  const semesters = state.data?.history || [];

  return (
    <section className="record-page">
      <PageHeader
        title="Academic history"
        purpose="Read-only official results."
      />

      <div className="filter-bar">
        <label>
          Semester
          <select value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
            <option value="">All recorded results</option>
            {semesters.map((item) => (
              <option key={item.id} value={item.semesterId}>
                {formatSemesterLabel(
                  { name: item.semesterName, sequence: item.semesterSequence },
                  { name: item.academicYearName, sequence: item.academicYearSequence },
                ) || item.semesterName || 'Semester'}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Panel title="Official results" kicker={`${rows.length} row${rows.length === 1 ? '' : 's'}`}>
        {rows.length === 0 ? (
          <EmptyState to="/results/me" action="Open current results">
            Official results are not available for this semester yet.
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <caption>Your official results</caption>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Result</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="result-subject">{item.subjectCode}</span>
                    </td>
                    <td>
                      <span className={item.isEca ? 'result-mark result-mark--eca' : 'result-mark'}>
                        {item.resultCode}
                      </span>
                    </td>
                    <td>{item.isEca ? 'Incomplete CA — not a final grade' : 'Official'}</td>
                    <td>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="panel-footnote">
          <Link to="/performance">Performance analytics</Link>
          <span className="panel-footnote__sep">·</span>
          <Link to="/ca">CA recovery</Link>
        </p>
      </Panel>
    </section>
  );
}
