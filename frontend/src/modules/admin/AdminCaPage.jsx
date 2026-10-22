import { useEffect, useMemo, useState } from 'react';
import { caApi } from '../ca-recovery/ca-api.js';
import { RecoveryResultReviews } from '../ca-recovery/RecoveryResultReviews.jsx';
import { academicApi } from './academic-api.js';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import {
  formatSemesterLabel,
  formatYearLabel,
  indexById,
} from '../../ui/academic-labels.js';

export function AdminCaPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [items, setItems] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [years, setYears] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [pending, setPending] = useState('');
  const busy = Boolean(pending);
  const [form, setForm] = useState({
    academicYearId: '',
    semesterId: '',
    opensAt: '',
    closesAt: '',
    published: true,
  });

  async function reload() {
    const [apps, yearRes, semRes, reviewRes] = await Promise.all([
      caApi.adminApplications(),
      academicApi.years(),
      academicApi.semesters(),
      caApi.recoveryResults(),
    ]);
    setItems(apps.data.items);
    setReviews(reviewRes.data.items || []);
    setYears(yearRes.data.items || yearRes.data || []);
    setSemesters(semRes.data.items || semRes.data || []);
  }

  useEffect(() => {
    let cancelled = false;
    reload()
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load CA queue');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function run(key, fn) {
    setPending(key);
    setError('');
    Promise.resolve()
      .then(fn)
      .then(reload)
      .catch((caught) => setError(caught.message || 'Action failed'))
      .finally(() => setPending(''));
  }

  const yearById = useMemo(() => indexById(Array.isArray(years) ? years : []), [years]);

  if (loading) {
    return <PageSkeleton title="CA recovery administration" variant="list" />;
  }

  return (
    <section className="admin-page record-page">
      <PageHeader
        title="CA recovery administration"
        purpose="Publish application windows, verify physical copies, and approve or reject applications. A separate review records an imported CA recovery grade."
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <RecoveryResultReviews
        items={reviews}
        pending={pending}
        onDecide={(id, decision) => run(`${decision}:${id}`, () => caApi.decideRecovery(id, decision))}
      />

      <Panel title="Diagnostics" kicker="Conditions">
        <div className="stack-item__actions">
          <ActionButton
            busy={pending === 'checks'}
            busyLabel="Checking…"
            disabled={busy}
            onClick={() => {
              setPending('checks');
              setError('');
              caApi
                .reconciliation()
                .then((response) => setReport(response.data))
                .catch((caught) => setError(caught.message))
                .finally(() => setPending(''));
            }}
          >
            Check CA conditions
          </ActionButton>
          <ActionButton
            busy={pending === 'backfill'}
            busyLabel="Backfilling…"
            disabled={busy}
            onClick={() => {
              if (
                !window.confirm(
                  'Create missing incomplete-CA conditions for current E(CA) results? Official grades are not changed.',
                )
              ) {
                return;
              }
              setPending('backfill');
              setError('');
              caApi
                .backfill()
                .then(() => caApi.reconciliation())
                .then((response) => setReport(response.data))
                .catch((caught) => setError(caught.message))
                .finally(() => setPending(''));
            }}
          >
            Backfill missing conditions
          </ActionButton>
        </div>
        {report ? (
          <div className="panel-subsection">
            <p className="panel-lead">
              Checks reported <strong>{report.issueCount}</strong> issue
              {report.issueCount === 1 ? '' : 's'}.
            </p>
          </div>
        ) : null}
      </Panel>

      <Panel title="Application window" kicker="Publish">
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            setPending('window');
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
              .catch((caught) => setError(caught.message))
              .finally(() => setPending(''));
          }}
        >
          <label>
            Academic year
            <select
              value={form.academicYearId}
              onChange={(event) => setForm({ ...form, academicYearId: event.target.value })}
              required
            >
              <option value="">Select</option>
              {(Array.isArray(years) ? years : []).map((item) => (
                <option key={item.id || item._id} value={item.id || item._id}>
                  {formatYearLabel(item) || item.name || item.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Semester
            <select
              value={form.semesterId}
              onChange={(event) => setForm({ ...form, semesterId: event.target.value })}
              required
            >
              <option value="">Select</option>
              {(Array.isArray(semesters) ? semesters : []).map((item) => (
                <option key={item.id || item._id} value={item.id || item._id}>
                  {formatSemesterLabel(item, yearById.get(String(item.academicYearId))) ||
                    item.name ||
                    item.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Opens
            <input
              type="datetime-local"
              value={form.opensAt}
              onChange={(event) => setForm({ ...form, opensAt: event.target.value })}
              required
            />
          </label>
          <label>
            Closes
            <input
              type="datetime-local"
              value={form.closesAt}
              onChange={(event) => setForm({ ...form, closesAt: event.target.value })}
              required
            />
          </label>
          <ActionButton type="submit" busy={pending === 'window'} busyLabel="Publishing…" disabled={busy}>
            Publish window
          </ActionButton>
        </form>
      </Panel>

      <Panel title="Application queue" kicker={`${items.length} application${items.length === 1 ? '' : 's'}`}>
        {items.length === 0 ? (
          <EmptyState to="/admin/results" action="Result imports">
            No CA applications in the queue.
          </EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Reg</th>
                  <th>Status</th>
                  <th>Physical</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.applicationId}</td>
                    <td>
                      <span className="result-subject">{item.registrationNumber}</span>
                    </td>
                    <td>
                      <span className="status-pill">{item.workflowStatus}</span>
                    </td>
                    <td>{item.physicalVerificationStatus}</td>
                    <td>
                      <div className="stack-item__actions">
                        <ActionButton
                          busy={pending === `verify:${item.applicationId}`}
                          busyLabel="Saving…"
                          disabled={busy}
                          onClick={() =>
                            run(`verify:${item.applicationId}`, () =>
                              caApi.verify(item.applicationId, { outcome: 'verified' }),
                            )
                          }
                        >
                          Physical OK
                        </ActionButton>
                        <ActionButton
                          busy={pending === `approve:${item.applicationId}`}
                          busyLabel="Approving…"
                          disabled={busy}
                          onClick={() => run(`approve:${item.applicationId}`, () => caApi.approve(item.applicationId))}
                        >
                          Approve
                        </ActionButton>
                        <ActionButton
                          busy={pending === `reject:${item.applicationId}`}
                          busyLabel="Rejecting…"
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt('Rejection reason');
                            if (reason) {
                              run(`reject:${item.applicationId}`, () => caApi.reject(item.applicationId, { reason }));
                            }
                          }}
                        >
                          Reject
                        </ActionButton>
                        <ActionButton
                          busy={pending === `reopen:${item.applicationId}`}
                          busyLabel="Reopening…"
                          disabled={busy}
                          onClick={() => {
                            const reason = window.prompt('Reopen reason');
                            if (reason) {
                              run(`reopen:${item.applicationId}`, () => caApi.reopen(item.applicationId, { reason }));
                            }
                          }}
                        >
                          Reopen
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </section>
  );
}
