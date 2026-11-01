import { useEffect, useState } from 'react';
import { caApi } from './ca-api.js';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';
import {
  formatConditionStatus,
  formatPdfStatus,
  formatWorkflowStatus,
} from '../../ui/status-labels.js';
import { CaExamForm } from './CaExamForm.jsx';

const EXAM_LABEL = {
  READY_TO_SCHEDULE: 'Approved. Waiting for your lecturer to publish the examination date.',
  COMPLETED: 'CA attended. Waiting for the official results.',
  MISSED: 'CA missed. You may apply for it again in the next CA application window.',
  RESOLVED: 'Resolved by your official result',
};

function formatColombo(value) {
  return new Date(value).toLocaleString('en-GB', {
    timeZone: 'Asia/Colombo',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

/** Each subject on an application is scheduled by its own lecturer, so each shows its own exam details. */
export function SubjectExams({ subjects = [] }) {
  const visible = subjects.filter((subject) => subject.examStatus && subject.examStatus !== 'PENDING_APPROVAL');
  if (!visible.length) {
    return null;
  }
  return (
    <ul className="stack-item__meta" aria-label="Subject examinations">
      {visible.map((subject) => (
        <li key={subject.incompleteCaId}>
          <strong>{subject.subjectCode}</strong>{' '}
          {subject.examStatus === 'SCHEDULED' && subject.exam
            ? `${formatColombo(subject.exam.scheduledAt)} (Asia/Colombo) · ${subject.exam.venue}`
            : EXAM_LABEL[subject.examStatus] || subject.examStatus}
        </li>
      ))}
    </ul>
  );
}

export function StudentCaPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [conditions, setConditions] = useState([]);
  const [windowInfo, setWindowInfo] = useState(null);
  const [applications, setApplications] = useState([]);
  const [selected, setSelected] = useState([]);
  const [pending, setPending] = useState('');
  const busy = Boolean(pending);
  const [timeline, setTimeline] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);

  async function reload() {
    const [cond, apps] = await Promise.all([caApi.conditions(), caApi.applications()]);
    setConditions(cond.data.items);
    setWindowInfo(cond.data.window);
    setApplications(apps.data.items);
  }

  useEffect(() => {
    let cancelled = false;
    reload()
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load CA recovery');
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

  if (loading) {
    return <PageSkeleton title="CA recovery" variant="list" />;
  }

  const openConditions = conditions.filter(
    (item) => item.status === 'OPEN' || item.status === 'IN_APPLICATION',
  );
  const returnedApplications = applications.filter(
    (item) => item.workflowStatus === 'DRAFT' && item.reopenReason,
  );

  function resubmitCorrection() {
    if (!editing?.form?.name?.trim()) {
      setError('Enter the name with initials before submitting.');
      return;
    }
    setPending('resubmit');
    setError('');
    caApi
      .update(editing.applicationId, { form: editing.form })
      .then(() => caApi.submit(editing.applicationId))
      .then(() => {
        setEditing(null);
        return reload();
      })
      .catch((caught) => setError(caught.message || 'The application could not be submitted again.'))
      .finally(() => setPending(''));
  }

  return (
    <section className="record-page">
      <PageHeader
        title="CA recovery"
        purpose="Apply when a CA recovery window is open."
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {returnedApplications.map((item) => (
        <p className="status-banner" role="status" key={item.applicationId}>
          <strong>{item.applicationId}</strong> was sent back for correction, so it is not approved yet. Reason: {item.reopenReason}. Check the form, correct it, and submit it again.
        </p>
      ))}

      {!error && openConditions.length ? (
        <p className="status-banner" role="status">
          You have unresolved incomplete CA conditions. Window:{' '}
          <strong>{windowInfo?.lifecycle || 'not published'}</strong>
          {windowInfo?.closesAt
            ? ` · closes ${new Date(windowInfo.closesAt).toLocaleString()}`
            : ''}
          .
        </p>
      ) : null}
      {!error && !openConditions.length ? (
        <p className="deadline-empty">No unresolved incomplete CA conditions.</p>
      ) : null}

      <Panel title="Choose subjects for this application" kicker="Current window">
        {openConditions.length === 0 ? (
          <EmptyState to="/results/me" action="View results">
            No eligible subjects for the current window.
          </EmptyState>
        ) : (
          <ul className="choice-list">
            {openConditions.map((item) => (
              <li key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={(event) => {
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, item.id]
                          : current.filter((id) => id !== item.id),
                      );
                    }}
                  />
                  <span>
                    <span className="stack-item__title">{item.subjectCode}</span>
                    <span className="stack-item__meta">
                      Condition {formatConditionStatus(item.status)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="panel-actions">
          <ActionButton
            busy={pending === 'review'}
            busyLabel="Preparing form…"
            disabled={busy || !selected.length}
            onClick={() => {
              const chosen = openConditions.filter((item) => selected.includes(item.id));
              if (!chosen.length) {
                return;
              }
              const groups = new Map();
              for (const item of chosen) {
                const key = `${item.academicYearId}|${item.semesterId}`;
                if (!groups.has(key)) {
                  groups.set(key, []);
                }
                groups.get(key).push(item);
              }
              setPending('review');
              setError('');
              Promise.all(
                [...groups.values()].map((group) =>
                  caApi
                    .preview({ incompleteCaIds: group.map((item) => item.id).join(',') })
                    .then((response) => ({
                      academicYearId: group[0].academicYearId,
                      semesterId: group[0].semesterId,
                      incompleteCaIds: group.map((item) => item.id),
                      form: response.data.form,
                    })),
                ),
              )
                .then((prepared) => {
                  setViewing(null);
                  setDrafts(prepared);
                })
                .catch((caught) => setError(caught.message))
                .finally(() => setPending(''));
            }}
          >
            Review form
          </ActionButton>
        </div>
      </Panel>

      {drafts.length ? (
        <Panel title="Review application" kicker="Check the form, edit any field, then submit">
          {drafts.map((draft, index) => (
            <CaExamForm
              key={`${draft.academicYearId}-${draft.semesterId}`}
              form={draft.form}
              onChange={(form) =>
                setDrafts((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, form } : item)))
              }
            />
          ))}
          <div className="panel-actions">
            <ActionButton
              busy={pending === 'apply'}
              busyLabel="Submitting…"
              disabled={busy}
              onClick={() => {
                const missingName = drafts.some((draft) => !draft.form?.name?.trim());
                if (missingName) {
                  setError('Enter the name with initials before submitting.');
                  return;
                }
                setPending('apply');
                setError('');
                Promise.all(
                  drafts.map((draft) =>
                    caApi
                      .create({
                        academicYearId: draft.academicYearId,
                        semesterId: draft.semesterId,
                        incompleteCaIds: draft.incompleteCaIds,
                        form: draft.form,
                      })
                      .then((created) => caApi.submit(created.data.applicationId)),
                  ),
                )
                  .then(() => {
                    setDrafts([]);
                    setSelected([]);
                    return reload();
                  })
                  .catch((caught) => setError(caught.message))
                  .finally(() => setPending(''));
              }}
            >
              Submit application
            </ActionButton>
            <ActionButton disabled={busy} onClick={() => setDrafts([])}>
              Back
            </ActionButton>
          </div>
        </Panel>
      ) : null}

      <Panel title="My applications" kicker={`${applications.length} total`}>
        {!error && applications.length === 0 ? (
          <p className="deadline-empty">No applications yet.</p>
        ) : null}
        {applications.length === 0 ? null : (
          <ul className="stack-list">
            {applications.map((item) => (
              <li key={item.id}>
                <div className="stack-item">
                  <span>
                    <span className="stack-item__title">{item.applicationId}</span>
                    <span className="stack-item__meta">
                      {formatWorkflowStatus(item.workflowStatus)}
                      {item.reopenReason && item.workflowStatus === 'DRAFT' ? ` · Sent back: ${item.reopenReason}` : ''}
                      {item.decisionReason ? ` · ${item.decisionReason}` : ''}
                      {` · ${formatPdfStatus(item.pdfStatus)}`}
                    </span>
                  </span>
                  <span className="stack-item__actions">
                    <ActionButton
                      busy={pending === `timeline:${item.applicationId}`}
                      busyLabel="Loading…"
                      disabled={busy && pending !== `timeline:${item.applicationId}`}
                      onClick={() => {
                        setPending(`timeline:${item.applicationId}`);
                        caApi
                          .get(item.applicationId)
                          .then((response) => setTimeline(response.data))
                          .catch((caught) => setError(caught.message))
                          .finally(() => setPending(''));
                      }}
                    >
                      Timeline
                    </ActionButton>
                    {item.workflowStatus === 'DRAFT' ? (
                      <ActionButton
                        busy={pending === `edit:${item.applicationId}`}
                        busyLabel="Opening…"
                        disabled={busy && pending !== `edit:${item.applicationId}`}
                        onClick={() => {
                          setPending(`edit:${item.applicationId}`);
                          setError('');
                          caApi
                            .get(item.applicationId)
                            .then((response) => {
                              setDrafts([]);
                              setViewing(null);
                              setEditing(response.data);
                            })
                            .catch((caught) => setError(caught.message))
                            .finally(() => setPending(''));
                        }}
                      >
                        {item.reopenReason ? 'Correct form' : 'Continue application'}
                      </ActionButton>
                    ) : (
                      <ActionButton
                        busy={pending === `form:${item.applicationId}`}
                        busyLabel="Opening…"
                        disabled={busy && pending !== `form:${item.applicationId}`}
                        onClick={() => {
                          setPending(`form:${item.applicationId}`);
                          caApi
                            .get(item.applicationId)
                            .then((response) => {
                              setDrafts([]);
                              setEditing(null);
                              setViewing(response.data);
                            })
                            .catch((caught) => setError(caught.message))
                            .finally(() => setPending(''));
                        }}
                      >
                        View form
                      </ActionButton>
                    )}
                    <ActionButton
                      busy={pending === `pdf:${item.applicationId}`}
                      busyLabel="Downloading…"
                      disabled={busy && pending !== `pdf:${item.applicationId}`}
                      onClick={() => {
                        setPending(`pdf:${item.applicationId}`);
                        setError('');
                        caApi
                          .download(item.applicationId)
                          .catch((caught) => setError(caught.message || 'The form could not be downloaded.'))
                          .finally(() => setPending(''));
                      }}
                    >
                      Download form
                    </ActionButton>
                  </span>
                </div>
                <SubjectExams subjects={item.subjects} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {editing?.form ? (
        <Panel title="Correct and resubmit" kicker={editing.applicationId} tone="attention">
          <p className="panel-lead">
            {editing.reopenReason
              ? `The department sent this application back. Reason: ${editing.reopenReason}. Update the form, then submit it again.`
              : 'This application is still a draft. Update the form, then submit it.'}
          </p>
          <CaExamForm
            form={editing.form}
            applicationId={editing.applicationId}
            onChange={(form) => setEditing((current) => (current ? { ...current, form } : current))}
          />
          <div className="panel-actions">
            <ActionButton busy={pending === 'resubmit'} busyLabel="Submitting…" disabled={busy} onClick={resubmitCorrection}>
              Submit again
            </ActionButton>
            <ActionButton disabled={busy} onClick={() => setEditing(null)}>
              Back
            </ActionButton>
          </div>
        </Panel>
      ) : null}

      {viewing?.form ? (
        <Panel title="Submitted application" kicker={viewing.applicationId}>
          <CaExamForm form={viewing.form} qrDataUrl={viewing.qrDataUrl} applicationId={viewing.applicationId} readOnly />
        </Panel>
      ) : null}

      {timeline?.timeline?.length ? (
        <Panel title="Status timeline" kicker={timeline.applicationId || 'Selected application'}>
          <ol className="timeline-list">
            {timeline.timeline.map((event) => (
              <li key={`${event.type}-${event.occurredAt}`}>
                <span className="timeline-list__title">
                  {event.type === 'MISSED'
                    ? 'CA missed'
                    : event.type === 'COMPLETED'
                      ? 'CA attended · awaiting results'
                      : formatWorkflowStatus(event.toStatus)}
                </span>
                {event.reason ? <span className="timeline-list__meta">{event.reason}</span> : null}
                {event.occurredAt ? (
                  <span className="timeline-list__meta">
                    {new Date(event.occurredAt).toLocaleString()}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}
    </section>
  );
}
