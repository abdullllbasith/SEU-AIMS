import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { communicationApi } from './communication-api.js';
import { useAuth } from '../../state/AuthProvider.jsx';
import { ROLES } from '../../constants/roles.js';
import { ActionButton } from '../../ui/ActionButton.jsx';
import { PageHeader } from '../../ui/PageHeader.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';
import { PageSkeleton } from '../../ui/Skeleton.jsx';

export function NoticesPage() {
  const { user } = useAuth();
  const { noticeId } = useParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: '', body: '' });
  const highlightedRef = useRef(null);

  function reload() {
    return communicationApi.notices().then((body) => setItems(body.data.items || []));
  }

  useEffect(() => {
    let cancelled = false;
    reload()
      .catch((caught) => {
        if (!cancelled) {
          setError(caught.message || 'Unable to load notices');
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
    if (!noticeId || !items.length) {
      return;
    }
    highlightedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [noticeId, items]);

  if (loading) {
    return <PageSkeleton title="Notices" variant="list" />;
  }

  const isAdmin = user?.role === ROLES.DEPARTMENT_ADMINISTRATOR;

  return (
    <section className="record-page">
      <PageHeader
        title="Notices"
        purpose="Department announcements in your scope. High-priority items are marked clearly."
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className={isAdmin ? 'notices-workspace' : 'record-page'}>
        {isAdmin ? (
          <Panel title="Publish a notice" kicker="Department admin">
            <p className="panel-lead panel-lead--tight">
              Broadcast an official announcement to students in this department.
            </p>
            <form
              className="settings-form settings-form--wide"
              onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                setError('');
                communicationApi
                  .adminCreateNotice({
                    title: form.title,
                    body: form.body,
                    targeting: { kind: 'ALL_STUDENTS' },
                  })
                  .then((created) => communicationApi.publishNotice(created.data.id))
                  .then(() => {
                    setForm({ title: '', body: '' });
                    return reload();
                  })
                  .catch((caught) => setError(caught.message))
                  .finally(() => setBusy(false));
              }}
            >
              <label>
                Title
                <input
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="e.g. Semester examination timetable published"
                  required
                  maxLength={160}
                />
              </label>
              <label>
                Body
                <textarea
                  value={form.body}
                  onChange={(event) => setForm({ ...form, body: event.target.value })}
                  placeholder="Write the official notice details…"
                  required
                  rows={6}
                />
              </label>
              <div className="panel-actions">
                <ActionButton type="submit" busy={busy} busyLabel="Publishing…" disabled={busy}>
                  Publish notice
                </ActionButton>
              </div>
            </form>
          </Panel>
        ) : null}

        <Panel title="Published notices" kicker={`${items.length} item${items.length === 1 ? '' : 's'}`}>
          {!error && items.length === 0 ? (
            <EmptyState to="/" action="Back to home">
              No published notices for your scope.
            </EmptyState>
          ) : null}
          {items.length === 0 ? null : (
            <ul className="notice-list">
              {items.map((item) => {
                const highlighted = noticeId === item.id;
                return (
                  <li
                    key={item.id}
                    id={`notice-${item.id}`}
                    ref={highlighted ? highlightedRef : null}
                    className={highlighted ? 'notice-card is-highlighted' : 'notice-card'}
                  >
                    <div className="notice-card__head">
                      <h2 className="notice-card__title">{item.title}</h2>
                      <div className="notice-card__badges">
                        {item.priority === 'HIGH' ? (
                          <span className="status-pill status-pill--pending">High</span>
                        ) : (
                          <span className="status-pill status-pill--info">Official</span>
                        )}
                        {highlighted ? (
                          <span className="status-pill status-pill--ok">From notification</span>
                        ) : null}
                      </div>
                    </div>
                    <p className="notice-card__body">{item.body}</p>
                    {item.publishedAt ? (
                      <p className="notice-card__meta">
                        Published {new Date(item.publishedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </section>
  );
}
