import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { communicationApi } from './communication-api.js';
import { NoticeCarousel } from './NoticeCarousel.jsx';
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
  const [photos, setPhotos] = useState([]);
  const [dragKey, setDragKey] = useState('');
  const highlightedRef = useRef(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => () => {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  }, []);

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
        purpose="Department announcements."
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
                  .then(async (created) => {
                    for (const photo of photos) {
                      const data = new FormData();
                      data.append('file', photo.file);
                      await communicationApi.uploadNoticeImage(created.data.id, data);
                    }
                    await communicationApi.publishNotice(created.data.id);
                  })
                  .then(() => {
                    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
                    setPhotos([]);
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
              <label>
                Photos
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => {
                    const selected = [...(event.target.files || [])].slice(0, 8 - photos.length);
                    const next = selected.map((file) => ({
                      key: `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
                      file,
                      previewUrl: URL.createObjectURL(file),
                    }));
                    setPhotos((current) => [...current, ...next].slice(0, 8));
                    event.target.value = '';
                  }}
                />
              </label>
              {photos.length ? (
                <ul className="notice-photo-strip">
                  {photos.map((photo, index) => (
                    <li
                      key={photo.key}
                      className={dragKey === photo.key ? 'notice-photo is-dragging' : 'notice-photo'}
                      draggable
                      onDragStart={() => setDragKey(photo.key)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (!dragKey || dragKey === photo.key) {
                          return;
                        }
                        setPhotos((current) => {
                          const from = current.findIndex((item) => item.key === dragKey);
                          const to = current.findIndex((item) => item.key === photo.key);
                          if (from < 0 || to < 0) {
                            return current;
                          }
                          const next = [...current];
                          const [moved] = next.splice(from, 1);
                          next.splice(to, 0, moved);
                          return next;
                        });
                        setDragKey('');
                      }}
                      onDragEnd={() => setDragKey('')}
                    >
                      <img src={photo.previewUrl} alt="" />
                      <span>{index + 1}</span>
                      <button
                        type="button"
                        className="notice-photo__remove"
                        onClick={() => {
                          URL.revokeObjectURL(photo.previewUrl);
                          setPhotos((current) => current.filter((item) => item.key !== photo.key));
                        }}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="filter-bar__hint">Add up to 8 photos. Drag them to set the order. Students see one photo at a time, changing every 3 seconds.</p>
              )}
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
                    <NoticeCarousel images={item.images} label={item.title} />
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
