import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { caApi } from '../ca-recovery/ca-api.js';
import { AdminCaReview } from './AdminCaReview.jsx';
import { CaQrScanner } from './CaQrScanner.jsx';
import { RecoveryResultReviews } from '../ca-recovery/RecoveryResultReviews.jsx';
import { AdminAttemptsPanel } from './AdminAttemptsPanel.jsx';
import { academicApi } from './academic-api.js';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { OperationNotice } from '../../ui/OperationNotice.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { StatCard } from '../../ui/StatCard.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import {
  formatSemesterShortName,
  formatYearLabel,
  indexById,
} from '../../ui/academic-labels.js';
import { formatWorkflowStatus } from '../../ui/status-labels.js';
const WINDOW_STATUS = {
  OPEN: { label: 'Open', className: 'status-pill status-pill--ok' },
  SCHEDULED: { label: 'Scheduled', className: 'status-pill status-pill--info' },
  CLOSED: { label: 'Closed', className: 'status-pill status-pill--muted' },
  SUSPENDED: { label: 'Suspended', className: 'status-pill status-pill--warning' },
  UNPUBLISHED: { label: 'Unpublished', className: 'status-pill status-pill--muted' },
};

function toLocalInput(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const EMPTY_WINDOW_FORM = {
  academicYearId: '',
  semesterId: '',
  opensAt: '',
  closesAt: '',
  published: true,
};

const PHYSICAL_LABEL = {
  NOT_STARTED: 'Not started',
  AWAITING_PHYSICAL: 'Awaiting physical copy',
  PHYSICALLY_VERIFIED: 'Verified',
  VERIFICATION_FAILED: 'Failed',
};

export function AdminCaPage() {
  const { applicationId } = useParams();
  if (applicationId) {
    return <AdminCaReview applicationId={applicationId} />;
  }
  return <AdminCaQueue />;
}

function AdminCaQueue() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [items, setItems] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [years, setYears] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [windows, setWindows] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [notices, setNotices] = useState({});
  const [pending, setPending] = useState('');
  const busy = Boolean(pending);
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_WINDOW_FORM);
  const [editingId, setEditingId] = useState('');
  const [windowOpen, setWindowOpen] = useState(false);
  const [lastVerified, setLastVerified] = useState(null);

  async function reload() {
    const [apps, yearRes, semRes, reviewRes, windowRes, conditionRes] = await Promise.all([
      caApi.adminApplications(),
      academicApi.years(),
      academicApi.semesters(),
      caApi.recoveryResults(),
      caApi.adminWindows(),
      caApi.unresolvedConditions(),
    ]);
    setItems(apps.data.items);
    setReviews(reviewRes.data.items || []);
    setYears(yearRes.data.items || yearRes.data || []);
    setSemesters(semRes.data.items || semRes.data || []);
    setWindows(windowRes.data.items || []);
    setConditions(conditionRes.data.items || []);
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

  useEffect(() => {
    if (loading || window.location.hash !== '#unresolved-eca') {
      return;
    }
    document.getElementById('unresolved-eca')?.scrollIntoView({ block: 'start' });
  }, [loading]);

  function run(key, fn) {
    setPending(key);
    setError('');
    Promise.resolve()
      .then(fn)
      .then(reload)
      .catch((caught) => setError(caught.message || 'Action failed'))
      .finally(() => setPending(''));
  }

  function notify(key, tone, message) {
    setNotices((current) => ({ ...current, [key]: { tone, message } }));
  }

  const yearById = useMemo(() => indexById(Array.isArray(years) ? years : []), [years]);
  const semesterById = useMemo(() => indexById(Array.isArray(semesters) ? semesters : []), [semesters]);
  const semesterChoices = useMemo(() => {
    if (!form.academicYearId) {
      return [];
    }
    return (Array.isArray(semesters) ? semesters : []).filter(
      (item) => String(item.academicYearId) === String(form.academicYearId),
    );
  }, [semesters, form.academicYearId]);

  function periodLabel(academicYearId, semesterId) {
    const year = yearById.get(String(academicYearId));
    const semester = semesterById.get(String(semesterId));
    const yearName = formatYearLabel(year);
    const semesterName = formatSemesterShortName(semester, year);
    return [yearName, semesterName].filter(Boolean).join(' · ');
  }

  function subjectPeriodLabel(item) {
    const fromLookup = periodLabel(item.subjectAcademicYearId, item.subjectSemesterId);
    if (fromLookup) {
      return fromLookup;
    }
    const yearName = formatYearLabel({
      name: item.subjectAcademicYearName,
      sequence: item.subjectAcademicYearSequence,
    });
    const semesterName = formatSemesterShortName(
      { name: item.subjectSemesterName, sequence: item.subjectSemesterSequence },
      { name: item.subjectAcademicYearName, sequence: item.subjectAcademicYearSequence },
    );
    return [yearName, semesterName].filter(Boolean).join(' · ');
  }

  function selectWindow(item) {
    setEditingId(item.id);
    setForm({
      academicYearId: item.academicYearId,
      semesterId: item.semesterId,
      opensAt: toLocalInput(item.opensAt),
      closesAt: toLocalInput(item.closesAt),
      published: item.published !== false,
    });
    setNotices((current) => ({ ...current, window: null }));
    setWindowOpen(true);
  }

  function clearWindowForm() {
    setEditingId('');
    setForm(EMPTY_WINDOW_FORM);
    setWindowOpen(false);
  }

  function openWindowDialog() {
    setEditingId('');
    setForm(EMPTY_WINDOW_FORM);
    setNotices((current) => ({ ...current, window: null }));
    setWindowOpen(true);
  }

  useEffect(() => {
    if (!windowOpen) {
      return undefined;
    }
    function onKey(event) {
      if (event.key === 'Escape' && !busy) {
        clearWindowForm();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [windowOpen, busy]);

  if (loading) {
    return <PageSkeleton title="CA recovery administration" variant="list" />;
  }

  return (
    <section className="admin-page record-page">
      <PageHeader
        title="CA recovery administration"
        purpose="CA windows, verification, and approvals."
        actions={
          <ActionButton onClick={openWindowDialog}>Create window</ActionButton>
        }
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="stat-row">
        <StatCard
          label="Open E(CA) conditions"
          value={conditions.length}
          icon="eca"
          tone="alert"
        />
        <StatCard
          label="Recovery reviews pending"
          value={reviews.length}
          icon="imports"
          tone="watch"
        />
        <StatCard
          label="Application windows"
          value={windows.length}
          icon="semesters"
        />
        <StatCard
          label="Applications in queue"
          value={items.length}
          icon="applications"
          tone="watch"
        />
      </div>

      <Panel title="Verify printed form" kicker="QR scan or Application ID">
        <CaQrScanner
          busy={busy}
          onSubmit={async (receipt) => {
            const response = await caApi.scanVerify(receipt, true);
            setLastVerified({
              applicationId: response.data.applicationId,
              alreadyVerified: Boolean(response.data.alreadyVerified),
            });
            await reload();
          }}
        />
        {lastVerified ? (
          <p className="receipt-check__status" role="status">
            {lastVerified.alreadyVerified
              ? `${lastVerified.applicationId} was already physically verified.`
              : `${lastVerified.applicationId} is physically verified.`}{' '}
            It is not approved yet.{' '}
            <Link to={`/admin/ca/${encodeURIComponent(lastVerified.applicationId)}`}>Review &amp; approve</Link>
          </p>
        ) : null}
      </Panel>

      <Panel
        id="unresolved-eca"
        title="Unresolved E(CA)"
        kicker={`${conditions.length} open`}
      >
        <p className="panel-lead">
          These are the open E(CA) conditions counted on the department overview. A student still has an official E(CA) result for each row.
        </p>
        {conditions.length === 0 ? (
          <EmptyState>No open E(CA) conditions.</EmptyState>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Subject</th>
                  <th>Period</th>
                  <th>Subject period</th>
                  <th>Detected</th>
                </tr>
              </thead>
              <tbody>
                {conditions.map((item) => (
                  <tr key={item.id}>
                    <td className="keep">{item.registrationNumber}</td>
                    <td className="keep">{item.subjectCode}</td>
                    <td className="keep">{periodLabel(item.academicYearId, item.semesterId) || '—'}</td>
                    <td className="keep">{subjectPeriodLabel(item) || '—'}</td>
                    <td className="keep">{item.detectedAt ? formatWhen(item.detectedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <AdminAttemptsPanel />

      <div className="dashboard-grid dashboard-grid--primary">
        <RecoveryResultReviews
          items={reviews}
          pending={pending}
          onDecide={(id, decision) => run(`${decision}:${id}`, () => caApi.decideRecovery(id, decision))}
        />

        <Panel title="Diagnostics" kicker="Conditions">
          <p className="panel-lead">
            Verify that every official E(CA) result has an active recovery condition record, or backfill missing conditions.
          </p>
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
      </div>

      <Panel title="Application windows" kicker={`${windows.length} published`}>
        {windows.length === 0 ? (
          <p className="panel-lead">No application windows yet. Use Create window to set when students can apply.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Opens</th>
                  <th>Closes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {windows.map((item) => {
                  const status = WINDOW_STATUS[item.lifecycle] || WINDOW_STATUS.UNPUBLISHED;
                  return (
                    <tr key={item.id}>
                      <td className="keep">{periodLabel(item.academicYearId, item.semesterId)}</td>
                      <td className="keep">
                        <span className={status.className}>{status.label}</span>
                      </td>
                      <td className="keep">{formatWhen(item.opensAt)}</td>
                      <td className="keep">{formatWhen(item.closesAt)}</td>
                      <td>
                        <div className="stack-item__actions">
                          <ActionButton
                            busy={pending === `edit:${item.id}`}
                            busyLabel="Opening…"
                            disabled={busy}
                            onClick={() => selectWindow(item)}
                          >
                            Edit
                          </ActionButton>
                          <ActionButton
                            busy={pending === `delete:${item.id}`}
                            busyLabel="Removing…"
                            disabled={busy}
                            onClick={() => {
                              const label = periodLabel(item.academicYearId, item.semesterId);
                              if (!window.confirm(`Remove the application window for ${label}?`)) {
                                return;
                              }
                              setPending(`delete:${item.id}`);
                              setError('');
                              caApi
                                .deleteWindow(item.id)
                                .then(() => {
                                  if (editingId === item.id) {
                                    clearWindowForm();
                                  }
                                  notify('window', 'success', `Removed the application window for ${label}.`);
                                  return reload();
                                })
                                .catch((caught) => notify('window', 'failure', caught.message || 'Application window could not be removed.'))
                                .finally(() => setPending(''));
                            }}
                          >
                            Delete
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <OperationNotice notice={windowOpen ? null : notices.window} />
      </Panel>
      {windowOpen ? (
        <div
          className="window-dialog"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy) {
              clearWindowForm();
            }
          }}
        >
          <div className="window-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="window-dialog-title">
            <h2 id="window-dialog-title">{editingId ? 'Edit application window' : 'Create application window'}</h2>
            <form
              id="ca-window-form"
              className="window-form window-form--dialog"
              onSubmit={(event) => {
                event.preventDefault();
                const year = yearById.get(String(form.academicYearId));
                const semester = semesterById.get(String(form.semesterId));
                if (!year || !semester || String(semester.academicYearId) !== String(form.academicYearId)) {
                  notify('window', 'failure', 'Choose an academic year, then one of its semesters.');
                  return;
                }
                setPending('window');
                setError('');
                caApi
                  .saveWindow({
                    academicYearId: form.academicYearId,
                    semesterId: form.semesterId,
                    opensAt: new Date(form.opensAt).toISOString(),
                    closesAt: new Date(form.closesAt).toISOString(),
                    published: form.published,
                    suspended: false,
                  })
                  .then(() => {
                    const label = `${formatYearLabel(year)} · ${formatSemesterShortName(semester, year)}`;
                    notify(
                      'window',
                      'success',
                      editingId ? `Saved changes for ${label}.` : `Application window published for ${label}.`,
                    );
                    clearWindowForm();
                    return reload();
                  })
                  .catch((caught) => notify('window', 'failure', caught.message || 'Application window could not be saved.'))
                  .finally(() => setPending(''));
              }}
            >
              <p className="panel-lead">
                {editingId
                  ? `Editing ${periodLabel(form.academicYearId, form.semesterId)}. Change the dates, then save. The year and semester stay the same.`
                  : 'Choose the year, then the semester, and set when students can apply.'}
              </p>
              <label>
                Academic year
                <select
                  value={form.academicYearId}
                  onChange={(event) => setForm({ ...form, academicYearId: event.target.value, semesterId: '' })}
                  required
                  disabled={Boolean(editingId)}
                >
                  <option value="">Select year</option>
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
                  disabled={Boolean(editingId) || !form.academicYearId}
                >
                  <option value="">{form.academicYearId ? 'Select semester' : 'Select a year first'}</option>
                  {semesterChoices.map((item) => (
                    <option key={item.id || item._id} value={item.id || item._id}>
                      {formatSemesterShortName(item, yearById.get(String(item.academicYearId))) || item.name || item.id}
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
              <div className="window-form__actions">
                <ActionButton type="button" disabled={busy} onClick={clearWindowForm}>
                  Cancel
                </ActionButton>
                <ActionButton type="submit" busy={pending === 'window'} busyLabel="Saving…" disabled={busy}>
                  {editingId ? 'Save changes' : 'Publish'}
                </ActionButton>
              </div>
            </form>
            <OperationNotice notice={notices.window} />
          </div>
        </div>
      ) : null}

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
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="queue-row"
                    onClick={(event) => {
                      if (event.target.closest('a')) {
                        return;
                      }
                      navigate(`/admin/ca/${encodeURIComponent(item.applicationId)}`);
                    }}
                  >
                    <td className="keep">
                      <Link to={`/admin/ca/${encodeURIComponent(item.applicationId)}`}>{item.applicationId}</Link>
                    </td>
                    <td className="keep">
                      <span className="result-subject">{item.registrationNumber}</span>
                    </td>
                    <td className="keep">
                      <span className="status-pill">{formatWorkflowStatus(item.workflowStatus)}</span>
                    </td>
                    <td className="keep">{PHYSICAL_LABEL[item.physicalVerificationStatus] || item.physicalVerificationStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <OperationNotice notice={notices.queue} />
      </Panel>
    </section>
  );
}
