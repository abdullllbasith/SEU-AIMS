import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { communicationApi } from './communication-api.js';
import { NoticeCarousel } from './NoticeCarousel.jsx';
import { adminApi } from '../admin/admin-api.js';
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
  const [channels, setChannels] = useState(null);
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState({ title: '', body: '' });
  const [cardBusy, setCardBusy] = useState('');
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
    if (user?.role !== ROLES.DEPARTMENT_ADMINISTRATOR) {
      return undefined;
    }
    let cancelled = false;
    adminApi
      .notificationHealth()
      .then((body) => {
        if (!cancelled) {
          setChannels(body.data?.channels || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChannels(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  function runCard(id, action) {
    setCardBusy(id);
    setError('');
    return Promise.resolve()
      .then(action)
      .then(() => reload().then(() => true))
      .catch((caught) => {
        setError(caught.message || 'Notice action failed');
        return false;
      })
      .finally(() => setCardBusy(''));
  }

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
              {channels && (!channels.email || !channels.whatsapp)
                ? ' Email and WhatsApp are not configured, so students see the notice in the app.'
                : ''}
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
                    {isAdmin && editingId === item.id ? (
                      <form
                        className="settings-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          runCard(item.id, () => communicationApi.updateNotice(item.id, editForm)).then((saved) => {
                            if (saved) {
                              setEditingId('');
                            }
                          });
                        }}
                      >
                        <label>
                          Title
                          <input
                            value={editForm.title}
                            onChange={(event) => setEditForm({ ...editForm, title: event.target.value })}
                            required
                            maxLength={160}
                          />
                        </label>
                        <label>
                          Body
                          <textarea
                            value={editForm.body}
                            onChange={(event) => setEditForm({ ...editForm, body: event.target.value })}
                            required
                            rows={4}
                          />
                        </label>
                        <div className="panel-actions">
                          <ActionButton type="submit" busy={cardBusy === item.id} busyLabel="Saving…" disabled={Boolean(cardBusy)}>
                            Save notice
                          </ActionButton>
                          <button type="button" disabled={Boolean(cardBusy)} onClick={() => setEditingId('')}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : null}
                    <NoticeCarousel images={item.images} label={item.title} />
                    {isAdmin && item.publicationState !== 'ARCHIVED' ? (
                      <div className="notice-manage">
                        {item.images?.length ? (
                          <ul className="notice-photo-strip">
                            {item.images.map((image, index) => (
                              <li key={image.id} className="notice-photo">
                                <img src={image.url} alt="" />
                                <span>{index + 1}</span>
                                <button
                                  type="button"
                                  className="notice-photo__remove"
                                  disabled={Boolean(cardBusy)}
                                  onClick={() => runCard(item.id, () => communicationApi.removeNoticeImage(item.id, image.id))}
                                >
                                  Remove
                                </button>
                                {index > 0 ? (
                                  <button
                                    type="button"
                                    disabled={Boolean(cardBusy)}
                                    onClick={() => {
                                      const imageIds = item.images.map((entry) => entry.id);
                                      const swap = imageIds[index - 1];
                                      imageIds[index - 1] = imageIds[index];
                                      imageIds[index] = swap;
                                      runCard(item.id, () => communicationApi.reorderNoticeImages(item.id, imageIds));
                                    }}
                                  >
                                    Earlier
                                  </button>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {(item.images?.length || 0) < 8 ? (
                          <label>
                            Add a photo
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              disabled={Boolean(cardBusy)}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = '';
                                if (!file) {
                                  return;
                                }
                                const data = new FormData();
                                data.append('file', file);
                                runCard(item.id, () => communicationApi.uploadNoticeImage(item.id, data));
                              }}
                            />
                          </label>
                        ) : null}
                        <div className="panel-actions">
                          <button
                            type="button"
                            disabled={Boolean(cardBusy)}
                            onClick={() => {
                              setEditingId(item.id);
                              setEditForm({ title: item.title, body: item.body });
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn--danger"
                            disabled={Boolean(cardBusy)}
                            onClick={() => {
                              if (!window.confirm('Withdraw this notice? Students will no longer see it.')) {
                                return;
                              }
                              runCard(item.id, () => communicationApi.archiveNotice(item.id));
                            }}
                          >
                            Withdraw
                          </button>
                        </div>
                      </div>
                    ) : null}
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
