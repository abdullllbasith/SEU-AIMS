import { useEffect, useState } from 'react';
import { caApi } from './ca-api.js';

const WORKFLOW_LABELS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted — print and obtain HOD signature',
  UNDER_VERIFICATION: 'Physical copy received',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SCHEDULED: 'Assessment scheduled',
  COMPLETED: 'Assessment completed (official result unchanged until a new import)',
  RESOLVED: 'Condition resolved by official result',
};

export function StudentCaPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [conditions, setConditions] = useState([]);
  const [windowInfo, setWindowInfo] = useState(null);
  const [applications, setApplications] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
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
    return <p>Loading CA recovery…</p>;
  }

  const openConditions = conditions.filter((item) => item.status === 'OPEN' || item.status === 'IN_APPLICATION');

  return (
    <section>
      <h1>CA recovery</h1>
      {error ? <p className="form-error">{error}</p> : null}
      {openConditions.length ? (
        <p role="status">
          You have unresolved incomplete CA conditions. Window:{' '}
          {windowInfo?.lifecycle || 'not published'}
          {windowInfo?.closesAt ? ` (closes ${new Date(windowInfo.closesAt).toLocaleString()})` : ''}.
          Print the PDF, obtain the physical HOD signature, and submit the paper copy. The system does not
          replace that step.
        </p>
      ) : (
        <p>No unresolved incomplete CA conditions.</p>
      )}
      <h2>Choose subjects for this application</h2>
      {openConditions.length === 0 ? <p>No eligible subjects for the current window.</p> : null}
      <ul>
        {openConditions.map((item) => (
          <li key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={(event) => {
                  setSelected((current) =>
                    event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id),
                  );
                }}
              />
              {item.subjectCode} ({item.status})
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={busy || !selected.length}
        onClick={() => {
          const first = openConditions[0];
          if (!first) {
            return;
          }
          setBusy(true);
          caApi
            .create({
              academicYearId: first.academicYearId,
              semesterId: first.semesterId,
              incompleteCaIds: selected,
              studentUserId: 'ignored',
            })
            .then((created) => caApi.submit(created.data.applicationId))
            .then(reload)
            .catch((caught) => setError(caught.message))
            .finally(() => setBusy(false));
        }}
      >
        Create and submit application
      </button>
      <h2>My applications</h2>
      {applications.length === 0 ? <p>No applications yet.</p> : null}
      <ul>
        {applications.map((item) => (
          <li key={item.id}>
            {item.applicationId} — {WORKFLOW_LABELS[item.workflowStatus] || item.workflowStatus}
            {item.decisionReason ? ` (${item.decisionReason})` : ''} / PDF {item.pdfStatus}{' '}
            <button
              type="button"
              onClick={() =>
                caApi
                  .get(item.applicationId)
                  .then((response) => setTimeline(response.data))
                  .catch((caught) => setError(caught.message))
              }
            >
              Timeline
            </button>
            {item.pdfStatus === 'READY' ? (
              <>
                {' '}
                <a href={caApi.pdfUrl(item.applicationId)}>Download PDF</a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {timeline?.timeline?.length ? (
        <div>
          <h2>Status timeline</h2>
          <ul>
            {timeline.timeline.map((event) => (
              <li key={`${event.type}-${event.occurredAt}`}>
                {WORKFLOW_LABELS[event.toStatus] || event.toStatus}
                {event.reason ? ` — ${event.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
