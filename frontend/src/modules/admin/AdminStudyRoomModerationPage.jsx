import { useEffect, useState } from 'react';
import { studyRoomApi } from '../study-room/study-room-api.js';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { StatCard } from '../../ui/StatCard.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';

export function AdminStudyRoomModerationPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [queue, setQueue] = useState([]);
  const [reports, setReports] = useState([]);
  const [pending, setPending] = useState('');
  const busy = Boolean(pending);

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

  function run(key, fn) {
    setPending(key);
    setError('');
    Promise.resolve()
      .then(fn)
      .then(reload)
      .catch((caught) => setError(caught.message || 'Action failed'))
      .finally(() => setPending(''));
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
        purpose="Review of student-shared files."
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="stat-row">
        <StatCard
          label="Moderation mode"
          value={reviewMode ? 'Admin review' : 'Non-review'}
          icon="ops"
        />
        <StatCard
          label="Pending student files"
          value={queue.length}
          icon="chat"
          tone="watch"
        />
        <StatCard
          label="Student reports"
          value={reports.length}
          icon="attention"
          tone="alert"
        />
      </div>

      <div className="dashboard-grid dashboard-grid--primary">
        <Panel title="Moderation mode" kicker={reviewMode ? 'Admin review' : 'Non-review'}>
          <p className="panel-lead">
            Current mode:{' '}
            <strong>
              {reviewMode ? 'Admin review required' : 'Non-review (malware scan still required)'}
            </strong>
          </p>
          <div className="panel-actions">
            <ActionButton
              busy={pending === 'mode'}
              busyLabel="Saving…"
              disabled={busy}
              onClick={() =>
                run('mode', () =>
                  studyRoomApi.updateModerationSettings({
                    moderationMode: reviewMode ? 'NON_REVIEW' : 'ADMIN_REVIEW',
                  }),
                )
              }
            >
              Switch moderation mode
            </ActionButton>
          </div>
        </Panel>

        <Panel title="Reports" kicker={`${reports.length} total`}>
          {reports.length === 0 ? (
            <p className="deadline-empty">No reports submitted by students.</p>
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
      </div>

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
                  <ActionButton
                    busy={pending === `approve:${item.id}`}
                    busyLabel="Approving…"
                    disabled={busy}
                    onClick={() => run(`approve:${item.id}`, () => studyRoomApi.approve(item.id))}
                  >
                    Approve
                  </ActionButton>
                  <ActionButton
                    busy={pending === `reject:${item.id}`}
                    busyLabel="Rejecting…"
                    disabled={busy}
                    onClick={() => run(`reject:${item.id}`, () => studyRoomApi.reject(item.id))}
                  >
                    Reject
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}
