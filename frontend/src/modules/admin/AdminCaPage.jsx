import { useEffect, useState } from 'react';
import { caApi } from '../ca-recovery/ca-api.js';
import { academicApi } from './academic-api.js';

export function AdminCaPage() {
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [items, setItems] = useState([]);
  const [years, setYears] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [form, setForm] = useState({
    academicYearId: '',
    semesterId: '',
    opensAt: '',
    closesAt: '',
    published: true,
  });

  async function reload() {
    const [apps, yearRes, semRes] = await Promise.all([
      caApi.adminApplications(),
      academicApi.years(),
      academicApi.semesters(),
    ]);
    setItems(apps.data.items);
    setYears(yearRes.data.items || yearRes.data || []);
    setSemesters(semRes.data.items || semRes.data || []);
  }

  useEffect(() => {
    reload().catch((caught) => setError(caught.message || 'Unable to load CA queue'));
  }, []);

  return (
    <section className="admin-page">
      <h1>CA recovery administration</h1>
      {error ? <p className="form-error">{error}</p> : null}
      <p>
        <button type="button" onClick={() => caApi.reconciliation().then((response) => setReport(response.data)).catch((caught) => setError(caught.message))}>
          Check CA conditions
        </button>{' '}
        <button
          type="button"
          onClick={() => {
            if (!window.confirm('Create missing incomplete-CA conditions for current E(CA) results? Official grades are not changed.')) {
              return;
            }
            caApi
              .backfill()
              .then(() => caApi.reconciliation())
              .then((response) => setReport(response.data))
              .catch((caught) => setError(caught.message));
          }}
        >
          Backfill missing conditions
        </button>
      </p>
      {report ? <p>Checks: {report.issueCount}</p> : null}
      <h2>Application window</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          caApi
            .saveWindow({
              academicYearId: form.academicYearId,
              semesterId: form.semesterId,
              opensAt: new Date(form.opensAt).toISOString(),
              closesAt: new Date(form.closesAt).toISOString(),
              published: form.published,
              suspended: false,
            })
            .then(() => setError(''))
            .catch((caught) => setError(caught.message));
        }}
      >
        <label>
          Academic year
          <select
            value={form.academicYearId}
            onChange={(event) => setForm({ ...form, academicYearId: event.target.value })}
          >
            <option value="">Select</option>
            {(Array.isArray(years) ? years : []).map((item) => (
              <option key={item.id || item._id} value={item.id || item._id}>
                {item.name || item.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Semester
          <select value={form.semesterId} onChange={(event) => setForm({ ...form, semesterId: event.target.value })}>
            <option value="">Select</option>
            {(Array.isArray(semesters) ? semesters : []).map((item) => (
              <option key={item.id || item._id} value={item.id || item._id}>
                {item.name || item.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Opens
          <input type="datetime-local" value={form.opensAt} onChange={(event) => setForm({ ...form, opensAt: event.target.value })} />
        </label>
        <label>
          Closes
          <input type="datetime-local" value={form.closesAt} onChange={(event) => setForm({ ...form, closesAt: event.target.value })} />
        </label>
        <button type="submit">Publish window</button>
      </form>
      <h2>Application queue</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Reg</th>
            <th>Status</th>
            <th>Physical</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.applicationId}</td>
              <td>{item.registrationNumber}</td>
              <td>{item.workflowStatus}</td>
              <td>{item.physicalVerificationStatus}</td>
              <td>
                <button type="button" onClick={() => caApi.verify(item.applicationId, { outcome: 'verified' }).then(reload).catch((caught) => setError(caught.message))}>
                  Physical OK
                </button>
                <button type="button" onClick={() => caApi.approve(item.applicationId).then(reload).catch((caught) => setError(caught.message))}>
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const reason = window.prompt('Rejection reason');
                    if (reason) {
                      caApi.reject(item.applicationId, { reason }).then(reload).catch((caught) => setError(caught.message));
                    }
                  }}
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const reason = window.prompt('Reopen reason');
                    if (reason) {
                      caApi.reopen(item.applicationId, { reason }).then(reload).catch((caught) => setError(caught.message));
                    }
                  }}
                >
                  Reopen
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
