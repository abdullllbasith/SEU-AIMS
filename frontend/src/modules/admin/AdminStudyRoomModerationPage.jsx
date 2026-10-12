import { useEffect, useState } from 'react';
import { studyRoomApi } from '../study-room/study-room-api.js';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';

export function AdminStudyRoomModerationPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [queue, setQueue] = useState([]);
  const [reports, setReports] = useState([]);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [mode, items, reportItems] = await Promise.all([
      studyRoomApi.moderationSettings(),
      studyRoomApi.moderationQueue(),
      studyRoomApi.reports(),
    ]);
    setSettings(mode.data);
    setQueue(items.data.items);
    setReports(reportItems.data.items);
  }

  useEffect(() => {
    let cancelled = false;
    reload()
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load moderation');
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

  function run(fn) {
    setBusy(true);
    setError('');
    Promise.resolve()
      .then(fn)
      .then(reload)
      .catch((caught) => setError(caught.message || 'Action failed'))
      .finally(() => setBusy(false));
  }

  if (loading) {
    return <PageSkeleton title="Study Room moderation" variant="list" />;
  }

  if (!settings && error) {
    return (
      <section className="record-page">
        <PageHeader title="Study Room moderation" />
        <p className="form-error" role="alert">
          {error}
        </p>
      </section>
    );
  }

  const reviewMode = settings?.moderationMode === 'ADMIN_REVIEW';

  return (
    <section className="record-page">
      <PageHeader
        title="Study Room moderation"
        purpose="Administrative review of student-shared files only. This page does not provide access to encrypted chat."
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <Panel title="Moderation mode" kicker={reviewMode ? 'Admin review' : 'Non-review'}>
        <p className="panel-lead">
          Current mode:{' '}
          <strong>
            {reviewMode ? 'Admin review required' : 'Non-review (malware scan still required)'}
          </strong>
        </p>
        <div className="panel-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(() =>
                studyRoomApi.updateModerationSettings({
                  moderationMode: reviewMode ? 'NON_REVIEW' : 'ADMIN_REVIEW',
                }),
              )
            }
          >
            Switch moderation mode
          </button>
        </div>
      </Panel>

      <Panel title="Pending student files" kicker={`${queue.length} waiting`}>
        {queue.length === 0 ? (
          <EmptyState to="/admin" action="Operations home">
            No files waiting for review.
          </EmptyState>
        ) : (
          <ul className="resource-list">
            {queue.map((item) => (
              <li key={item.id} className="resource-row">
                <div className="resource-row__main">
                  <p className="resource-row__title">{item.displayFilename}</p>
                  <p className="resource-row__meta">{item.moderationState}</p>
                </div>
                <div className="resource-row__aside">
                  <button type="button" disabled={busy} onClick={() => run(() => studyRoomApi.approve(item.id))}>
                    Approve
                  </button>
                  <button type="button" disabled={busy} onClick={() => run(() => studyRoomApi.reject(item.id))}>
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Reports" kicker={`${reports.length} total`}>
        {reports.length === 0 ? (
          <p className="deadline-empty">No reports.</p>
        ) : (
          <ul className="stack-list">
            {reports.map((item) => (
              <li key={item.id}>
                <span className="stack-item__title">{item.category}</span>
                <span className="stack-item__meta">{item.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}
