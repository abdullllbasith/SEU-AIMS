import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { caApi } from './ca-api.js';
import { RecoveryResultReviews } from './RecoveryResultReviews.jsx';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';

const EXAM_STATUS_LABEL = {
  READY_TO_SCHEDULE: 'Waiting for a notice',
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
};

const EMPTY_FORM = { subjectOfferingId: '', date: '', startTime: '', endTime: '', venue: '' };

function NoticeForm({ idPrefix, form, onChange, offerings, lockOffering = false, submitLabel, busy, onSubmit, onCancel }) {
  return (
    <form
      className="ca-notice-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {lockOffering ? null : (
        <label>
          Subject
          <select
            aria-label="Subject"
            value={form.subjectOfferingId}
            onChange={(event) => onChange({ ...form, subjectOfferingId: event.target.value })}
          >
            <option value="">Choose a subject</option>
            {offerings.map((offering) => (
              <option key={offering.subjectOfferingId} value={offering.subjectOfferingId}>
                {offering.subjectCode} {offering.subjectName}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Date
        <input
          id={`${idPrefix}-date`}
          type="date"
          aria-label="Date"
          value={form.date}
          onChange={(event) => onChange({ ...form, date: event.target.value })}
        />
      </label>
      <label>
        Start time (Asia/Colombo)
        <input
          type="time"
          aria-label="Start time"
          value={form.startTime}
          onChange={(event) => onChange({ ...form, startTime: event.target.value })}
        />
      </label>
      <label>
        End time (optional)
        <input
          type="time"
          aria-label="End time"
          value={form.endTime}
          onChange={(event) => onChange({ ...form, endTime: event.target.value })}
        />
      </label>
      <label>
        Venue
        <input
          aria-label="Venue"
          value={form.venue}
          maxLength={200}
          onChange={(event) => onChange({ ...form, venue: event.target.value })}
        />
      </label>
      <div className="stack-item__actions">
        <ActionButton className="btn--primary" type="submit" busy={busy} busyLabel="Saving…" disabled={busy}>
          {submitLabel}
        </ActionButton>
        {onCancel ? (
          <ActionButton disabled={busy} onClick={onCancel}>
            Close
          </ActionButton>
        ) : null}
      </div>
    </form>
  );
}

function payloadFrom(form) {
  const body = { date: form.date, startTime: form.startTime, venue: form.venue };
  if (form.endTime) {
    body.endTime = form.endTime;
  }
  return body;
}

export function LecturerCaPage() {
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [notices, setNotices] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [busyKey, setBusyKey] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState('');
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [cancelling, setCancelling] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [delivery, setDelivery] = useState({});

  async function reload() {
    const [eligible, noticeRes, reviewRes] = await Promise.all([
      caApi.lecturerEligible(),
      caApi.examNotices(),
      caApi.recoveryResults(),
    ]);
    setItems(eligible.data.items);
    setNotices(noticeRes.data.items || []);
    setReviews(reviewRes.data.items || []);
  }

  useEffect(() => {
    let cancelled = false;
    reload()
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load CA scheduling');
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

  function runAction(key, fn, success = '') {
    setBusyKey(key);
    setError('');
    setMessage('');
    return Promise.resolve()
      .then(fn)
      .then(reload)
      .then(() => {
        if (success) {
          setMessage(success);
        }
        return true;
      })
      .catch((caught) => {
        setError(caught.message || 'Action failed');
        return false;
      })
      .finally(() => setBusyKey(''));
  }

  const publishedOfferingIds = useMemo(
    () => new Set(notices.filter((notice) => notice.status === 'PUBLISHED').map((notice) => notice.subjectOfferingId)),
    [notices],
  );

  // Subjects that still have students waiting and no published notice.
  const offeringsToSchedule = useMemo(() => {
    const byOffering = new Map();
    for (const item of items) {
      if (item.examStatus === 'READY_TO_SCHEDULE' && !publishedOfferingIds.has(item.subjectOfferingId)) {
        byOffering.set(item.subjectOfferingId, item);
      }
    }
    return [...byOffering.values()];
  }, [items, publishedOfferingIds]);

  const groups = useMemo(() => {
    const byOffering = new Map();
    for (const item of items) {
      if (!byOffering.has(item.subjectOfferingId)) {
        byOffering.set(item.subjectOfferingId, { key: item.subjectOfferingId, title: `${item.subjectCode} ${item.subjectName}`, rows: [] });
      }
      byOffering.get(item.subjectOfferingId).rows.push(item);
    }
    return [...byOffering.values()];
  }, [items]);

  if (loading) {
    return <PageSkeleton title="CA scheduling" variant="list" />;
  }

  return (
    <section className="record-page">
      <PageHeader
        title="CA scheduling"
        purpose="Publish CA examination notices per subject. Students are notified and reminded automatically."
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="receipt-check__status" role="status">
          {message}
        </p>
      ) : null}

      <RecoveryResultReviews
        items={reviews}
        pending={busyKey}
        onDecide={(id, decision) => runAction(`${decision}:${id}`, () => caApi.decideRecovery(id, decision))}
      />

      <Panel title="Publish examination notice" kicker="One notice per subject">
        {offeringsToSchedule.length === 0 ? (
          <p className="deadline-empty">No subject has approved students waiting for a notice.</p>
        ) : (
          <NoticeForm
            idPrefix="publish"
            form={form}
            onChange={setForm}
            offerings={offeringsToSchedule}
            submitLabel="Publish notice"
            busy={busyKey === 'publish'}
            onSubmit={() =>
              runAction(
                'publish',
                () => caApi.publishExamNotice({ subjectOfferingId: form.subjectOfferingId, ...payloadFrom(form) }),
                'Examination notice published. Approved students of that subject have been notified.',
              ).then((ok) => {
                if (ok) {
                  setForm(EMPTY_FORM);
                }
              })
            }
          />
        )}
      </Panel>

      <Panel title="Examination notices" kicker={`${notices.length} total`}>
        {notices.length === 0 ? (
          <p className="deadline-empty">No examination notices published yet.</p>
        ) : (
          <ul className="stack-list">
            {notices.map((notice) => {
              const published = notice.status === 'PUBLISHED';
              return (
                <li key={notice.id}>
                  <div className="stack-item">
                    <span>
                      <span className="stack-item__title">
                        {notice.subjectCode} {notice.subjectName}
                      </span>
                      <span className="stack-item__meta">
                        {notice.localDate} · {notice.localTime} (Asia/Colombo) · {notice.venue} ·{' '}
                        {published ? `${notice.studentCount} student${notice.studentCount === 1 ? '' : 's'}` : 'cancelled'}
                        {notice.generation > 1 ? ` · rescheduled ×${notice.generation - 1}` : ''}
                      </span>
                      {!published && notice.cancelReason ? (
                        <span className="stack-item__meta">Reason: {notice.cancelReason}</span>
                      ) : null}
                    </span>
                    <span className="stack-item__actions">
                      {published ? (
                        <>
                          <ActionButton
                            disabled={Boolean(busyKey)}
                            onClick={() => {
                              setCancelling('');
                              setEditing(editing === notice.id ? '' : notice.id);
                              setEditForm({
                                subjectOfferingId: notice.subjectOfferingId,
                                date: '',
                                startTime: '',
                                endTime: '',
                                venue: notice.venue,
                              });
                            }}
                          >
                            Reschedule
                          </ActionButton>
                          <ActionButton
                            busy={busyKey === `attach:${notice.id}`}
                            busyLabel="Adding…"
                            disabled={Boolean(busyKey)}
                            onClick={() =>
                              runAction(
                                `attach:${notice.id}`,
                                () => caApi.attachToExamNotice(notice.id),
                                'Newly approved students were added to this notice.',
                              )
                            }
                          >
                            Add newly approved students
                          </ActionButton>
                          <ActionButton
                            disabled={Boolean(busyKey)}
                            onClick={() => {
                              setEditing('');
                              setCancelReason('');
                              setCancelling(cancelling === notice.id ? '' : notice.id);
                            }}
                          >
                            Cancel notice
                          </ActionButton>
                        </>
                      ) : (
                        <span className="status-pill status-pill--danger">Cancelled</span>
                      )}
                      <ActionButton
                        disabled={Boolean(busyKey)}
                        onClick={() =>
                          caApi
                            .examNoticeDelivery(notice.id)
                            .then((response) => setDelivery((current) => ({ ...current, [notice.id]: response.data.items })))
                            .catch((caught) => setError(caught.message || 'Delivery status could not be loaded'))
                        }
                      >
                        Delivery status
                      </ActionButton>
                    </span>
                  </div>
                  {delivery[notice.id] ? (
                    <p className="stack-item__meta" aria-label="Delivery status">
                      {delivery[notice.id].length
                        ? delivery[notice.id].map((row) => `${row.channel} ${row.status} ${row.count}`).join(' · ')
                        : 'No notifications recorded.'}
                    </p>
                  ) : null}
                  {editing === notice.id ? (
                    <NoticeForm
                      idPrefix={`edit-${notice.id}`}
                      form={editForm}
                      onChange={setEditForm}
                      offerings={[]}
                      lockOffering
                      submitLabel="Save new date and time"
                      busy={busyKey === `reschedule:${notice.id}`}
                      onCancel={() => setEditing('')}
                      onSubmit={() =>
                        runAction(
                          `reschedule:${notice.id}`,
                          () => caApi.rescheduleExamNotice(notice.id, payloadFrom(editForm)),
                          'Examination rescheduled. Students were notified and their reminders were regenerated.',
                        ).then((ok) => ok && setEditing(''))
                      }
                    />
                  ) : null}
                  {cancelling === notice.id ? (
                    <div className="ca-notice-form">
                      <label>
                        Reason for cancelling
                        <input
                          aria-label="Reason for cancelling"
                          value={cancelReason}
                          onChange={(event) => setCancelReason(event.target.value)}
                        />
                      </label>
                      <div className="stack-item__actions">
                        <ActionButton
                          busy={busyKey === `cancel:${notice.id}`}
                          busyLabel="Cancelling…"
                          disabled={Boolean(busyKey) || !cancelReason.trim()}
                          onClick={() =>
                            runAction(
                              `cancel:${notice.id}`,
                              () => caApi.cancelExamNotice(notice.id, cancelReason.trim()),
                              'Examination notice cancelled. Students were told and their reminders were cancelled.',
                            ).then((ok) => ok && setCancelling(''))
                          }
                        >
                          Confirm cancellation
                        </ActionButton>
                        <ActionButton disabled={Boolean(busyKey)} onClick={() => setCancelling('')}>
                          Keep notice
                        </ActionButton>
                      </div>
                    </div>
                  ) : null}
                  {notice.history?.length > 1 ? (
                    <ul className="stack-item__meta">
                      {notice.history.map((entry) => (
                        <li key={`${entry.generation}-${entry.action}-${entry.at}`}>
                          {entry.action.toLowerCase()} (version {entry.generation})
                          {entry.reason ? ` — ${entry.reason}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Approved students by subject" kicker={`${items.length} subject${items.length === 1 ? '' : 's'} to follow`}>
        {groups.length === 0 ? (
          <EmptyState to="/lecturer/offerings" action="View assignments">
            No approved CA students in your assigned offerings.
          </EmptyState>
        ) : (
          groups.map((group) => (
            <div key={group.key}>
              <h3 className="panel-subtitle">{group.title}</h3>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Application</th>
                      <th>Registration</th>
                      <th>Subject status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((item) => (
                      <tr key={item.linkId}>
                        <td>{item.applicationId}</td>
                        <td>
                          <span className="result-subject">{item.registrationNumber}</span>
                        </td>
                        <td>
                          <span className="status-pill">{EXAM_STATUS_LABEL[item.examStatus] || item.examStatus}</span>
                        </td>
                        <td>
                          {item.examStatus === 'SCHEDULED' || item.examStatus === 'READY_TO_SCHEDULE' ? (
                            <ActionButton
                              busy={busyKey === `complete:${item.linkId}`}
                              busyLabel="Saving…"
                              disabled={Boolean(busyKey)}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Mark ${item.subjectCode} as completed for ${item.registrationNumber}? This does not change the official result or the student's other subjects.`,
                                  )
                                ) {
                                  return;
                                }
                                runAction(`complete:${item.linkId}`, () => caApi.completeSubject(item.linkId));
                              }}
                            >
                              Mark completed
                            </ActionButton>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
        <p className="panel-footnote">
          <Link to="/">Teaching workspace</Link>
        </p>
      </Panel>
    </section>
  );
}
