import { useEffect, useMemo, useState } from 'react';
import { experienceApi } from './experience-api.js';

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
    return <p>Loading academic history…</p>;
  }
  if (state.error) {
    return <p className="form-error">{state.error}</p>;
  }

  const semesters = state.data?.history || [];

  return (
    <section>
      <h1>Academic history</h1>
      <p>Official results are read-only. Current semester remains {state.data?.current?.registrationNumber}.</p>
      <label>
        Semester
        <select value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
          <option value="">All recorded results</option>
          {semesters.map((item) => (
            <option key={item.id} value={item.semesterId}>
              {item.semesterId}
            </option>
          ))}
        </select>
      </label>
      {rows.length === 0 ? <p>Official results are not available for this semester yet.</p> : null}
      {rows.length ? (
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
                  <td>{item.subjectCode}</td>
                  <td>{item.resultCode}</td>
                  <td>{item.isEca ? 'Incomplete CA — not a final grade' : 'Official'}</td>
                  <td>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
