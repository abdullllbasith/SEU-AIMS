import { Fragment, useEffect, useMemo, useState } from 'react';
import { caApi } from '../ca-recovery/ca-api.js';
import { RecoveryResultReviews } from '../ca-recovery/RecoveryResultReviews.jsx';
import { academicApi } from './academic-api.js';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { OperationNotice } from '../../ui/OperationNotice.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
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

function queueActions(item) {
  const status = item.workflowStatus;
  const physical = item.physicalVerificationStatus;
  return {
    verify: ['SUBMITTED', 'UNDER_VERIFICATION'].includes(status) && physical !== 'PHYSICALLY_VERIFIED',
    approve: status === 'UNDER_VERIFICATION' && physical === 'PHYSICALLY_VERIFIED',
    reject: ['DRAFT', 'SUBMITTED', 'UNDER_VERIFICATION'].includes(status),
    reopen: ['REJECTED', 'SUBMITTED'].includes(status),
  };
}

export function AdminCaPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState(null);
  const [items, setItems] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [years, setYears] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [windows, setWindows] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [reasons, setReasons] = useState({});
  const [notices, setNotices] = useState({});
  const [pending, setPending] = useState('');
  const busy = Boolean(pending);
  const [form, setForm] = useState(EMPTY_WINDOW_FORM);
  const [editingId, setEditingId] = useState('');

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
    requestAnimationFrame(() => {
      document.getElementById('ca-window-form')?.scrollIntoView({ block: 'nearest' });
    });
  }

  function clearWindowForm() {
    setEditingId('');
    setForm(EMPTY_WINDOW_FORM);
  }

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
                  <th>Detected</th>
                </tr>
              </thead>
              <tbody>
                {conditions.map((item) => (
                  <tr key={item.id}>
                    <td className="keep">{item.registrationNumber}</td>
                    <td className="keep">{item.subjectCode}</td>
                    <td className="keep">{periodLabel(item.academicYearId, item.semesterId) || '—'}</td>
                    <td className="keep">{item.detectedAt ? formatWhen(item.detectedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

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

      <Panel title="Application windows" kicker={editingId ? 'Edit' : 'Publish'}>
        {windows.length === 0 ? (
          <p className="panel-lead">No application windows yet. Publish one below.</p>
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
                    <tr key={item.id} className={editingId === item.id ? 'is-selected' : undefined}>
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
                            {editingId === item.id ? 'Selected' : 'Edit'}
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
        <form
          id="ca-window-form"
          className="window-form"
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
          <p className="panel-lead" style={{ gridColumn: '1 / -1' }}>
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
            <ActionButton type="submit" busy={pending === 'window'} busyLabel="Saving…" disabled={busy}>
              {editingId ? 'Save changes' : 'Publish window'}
            </ActionButton>
            {editingId ? (
              <ActionButton disabled={busy} onClick={clearWindowForm}>
                Cancel
              </ActionButton>
            ) : null}
          </div>
        </form>
        <OperationNotice notice={notices.window} />
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
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const actions = queueActions(item);
                  const needsReason = actions.reject || actions.reopen;
                  const reason = reasons[item.applicationId] || '';
                  const hasActions = actions.verify || actions.approve || actions.reject || actions.reopen;
                  return (
                    <Fragment key={item.id}>
                    <tr>
                      <td className="keep">{item.applicationId}</td>
                      <td className="keep">
                        <span className="result-subject">{item.registrationNumber}</span>
                      </td>
                      <td className="keep">
                        <span className="status-pill">{formatWorkflowStatus(item.workflowStatus)}</span>
                      </td>
                      <td className="keep">{PHYSICAL_LABEL[item.physicalVerificationStatus] || item.physicalVerificationStatus}</td>
                    </tr>
                    {hasActions || item.workflowStatus === 'DRAFT' ? (
                      <tr className="queue-detail">
                        <td colSpan={4}>
                          <div className="queue-detail__bar">
                            {item.workflowStatus === 'DRAFT' ? (
                              <p className="queue-note">
                                Still a draft. Physical verification starts after the student submits it.
                              </p>
                            ) : (
                              <span />
                            )}
                            <div className="queue-detail__actions">
                          {actions.verify ? (
                            <ActionButton
                              busy={pending === `verify:${item.applicationId}`}
                              busyLabel="Saving…"
                              disabled={busy}
                              onClick={() => {
                                setPending(`verify:${item.applicationId}`);
                                setError('');
                                caApi
                                  .verify(item.applicationId, { outcome: 'verified' })
                                  .then(() => {
                                    notify('queue', 'success', `${item.applicationId} marked physically verified.`);
                                    return reload();
                                  })
                                  .catch((caught) => notify('queue', 'failure', caught.message || 'Physical verification failed.'))
                                  .finally(() => setPending(''));
                              }}
                            >
                              Physical OK
                            </ActionButton>
                          ) : null}
                          {actions.approve ? (
                            <ActionButton
                              busy={pending === `approve:${item.applicationId}`}
                              busyLabel="Approving…"
                              disabled={busy}
                              onClick={() => {
                                setPending(`approve:${item.applicationId}`);
                                setError('');
                                caApi
                                  .approve(item.applicationId)
                                  .then(() => {
                                    notify('queue', 'success', `${item.applicationId} approved.`);
                                    return reload();
                                  })
                                  .catch((caught) => notify('queue', 'failure', caught.message || 'Application could not be approved.'))
                                  .finally(() => setPending(''));
                              }}
                            >
                              Approve
                            </ActionButton>
                          ) : null}
                          {needsReason ? (
                            <label className="queue-reason">
                              Reason
                              <input
                                value={reason}
                                onChange={(event) =>
                                  setReasons((current) => ({ ...current, [item.applicationId]: event.target.value }))
                                }
                              />
                            </label>
                          ) : null}
                          {actions.reject ? (
                            <ActionButton
                              busy={pending === `reject:${item.applicationId}`}
                              busyLabel="Rejecting…"
                              disabled={busy}
                              onClick={() => {
                                if (!reason.trim()) {
                                  notify('queue', 'failure', 'Enter a reason before rejecting this application.');
                                  return;
                                }
                                setPending(`reject:${item.applicationId}`);
                                setError('');
                                caApi
                                  .reject(item.applicationId, { reason: reason.trim() })
                                  .then(() => {
                                    notify('queue', 'success', `${item.applicationId} rejected.`);
                                    return reload();
                                  })
                                  .catch((caught) => notify('queue', 'failure', caught.message || 'Application could not be rejected.'))
                                  .finally(() => setPending(''));
                              }}
                            >
                              Reject
                            </ActionButton>
                          ) : null}
                          {actions.reopen ? (
                            <ActionButton
                              busy={pending === `reopen:${item.applicationId}`}
                              busyLabel="Reopening…"
                              disabled={busy}
                              onClick={() => {
                                if (!reason.trim()) {
                                  notify('queue', 'failure', 'Enter a reason before reopening this application.');
                                  return;
                                }
                                setPending(`reopen:${item.applicationId}`);
                                setError('');
                                caApi
                                  .reopen(item.applicationId, { reason: reason.trim() })
                                  .then(() => {
                                    notify('queue', 'success', `${item.applicationId} reopened as a draft.`);
                                    return reload();
                                  })
                                  .catch((caught) => notify('queue', 'failure', caught.message || 'Application could not be reopened.'))
                                  .finally(() => setPending(''));
                              }}
                            >
                              Reopen
                            </ActionButton>
                          ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <OperationNotice notice={notices.queue} />
      </Panel>
    </section>
  );
}
