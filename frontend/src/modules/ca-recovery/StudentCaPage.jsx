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

  return (
    <section className="record-page">
      <PageHeader
        title="CA recovery"
        purpose="Apply for incomplete CA recovery when a window is open. Print the PDF, obtain the physical HOD signature, and submit the paper copy — the system does not replace that step."
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

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
            busy={pending === 'apply'}
            busyLabel="Submitting…"
            disabled={busy || !selected.length}
            onClick={() => {
              const first = openConditions[0];
              if (!first) {
                return;
              }
              setPending('apply');
              setError('');
              caApi
                .create({
                  academicYearId: first.academicYearId,
                  semesterId: first.semesterId,
                  incompleteCaIds: selected,
                  studentUserId: 'ignored',
                })
                .then((created) => caApi.submit(created.data.applicationId))
                .then(() => {
                  setSelected([]);
                  return reload();
                })
                .catch((caught) => setError(caught.message))
                .finally(() => setPending(''));
            }}
          >
            Create and submit application
          </ActionButton>
        </div>
      </Panel>

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
                    {item.pdfStatus === 'READY' ? (
                      <a className="text-action" href={caApi.pdfUrl(item.applicationId)}>
                        Download PDF
                      </a>
                    ) : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {timeline?.timeline?.length ? (
        <Panel title="Status timeline" kicker={timeline.applicationId || 'Selected application'}>
          <ol className="timeline-list">
            {timeline.timeline.map((event) => (
              <li key={`${event.type}-${event.occurredAt}`}>
                <span className="timeline-list__title">
                  {formatWorkflowStatus(event.toStatus)}
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
