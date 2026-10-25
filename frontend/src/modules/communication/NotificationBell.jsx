import { Link, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { communicationApi } from './communication-api.js';
import {
  formatNotificationTitle,
  formatNotificationWhen,
  notificationActionPath,
  notificationBody,
} from './notification-display.js';

function BellIcon() {
  return (
    <svg
      className="notice-bell__icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function NotificationBell() {
  const location = useLocation();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(() => {
    communicationApi
      .unread()
      .then((body) => setCount(body.data.count || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshCount();
  }, [refreshCount, location.pathname]);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    setLoading(true);
    communicationApi
      .notifications('?pageSize=8')
      .then((body) => {
        setItems(body.data.items || []);
        refreshCount();
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    function onPointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, refreshCount]);

  function handleOpenItem(item) {
    if (!item.readAt) {
      communicationApi
        .markRead(item.id)
        .then(() => {
          setItems((current) =>
            current.map((row) =>
              row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row,
            ),
          );
          refreshCount();
        })
        .catch(() => {});
    }
    setOpen(false);
  }

  const badge = count > 99 ? '99+' : count;

  return (
    <div className="notice-bell" ref={rootRef}>
      <button
        type="button"
        className="notice-bell__trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="notice-bell-panel"
        aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
        onClick={() => setOpen((value) => !value)}
      >
        <BellIcon />
        {count ? (
          <span className="notice-bell__badge" aria-hidden="true">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id="notice-bell-panel"
          className="notice-bell__panel"
          role="dialog"
          aria-label="Recent notifications"
        >
          <div className="notice-bell__head">
            <p className="notice-bell__title">Notifications</p>
            {count ? <span className="notice-bell__meta">{count} unread</span> : null}
          </div>

          <div className="notice-bell__body">
            {loading ? <p className="notice-bell__status">Loading…</p> : null}
            {!loading && items.length === 0 ? (
              <p className="notice-bell__status">You are up to date.</p>
            ) : null}
            {!loading && items.length > 0 ? (
              <ul className="notice-bell__list">
                {items.map((item) => {
                  const title = formatNotificationTitle(item);
                  const preview = notificationBody(item);
                  const when = formatNotificationWhen(item.createdAt);
                  const target = notificationActionPath(item);
                  const unread = !item.readAt;

                  if (target) {
                    return (
                      <li key={item.id}>
                        <Link
                          to={target}
                          className={unread ? 'notice-bell__item is-unread' : 'notice-bell__item'}
                          onClick={() => handleOpenItem(item)}
                        >
                          <span className="notice-bell__item-title">{title}</span>
                          {preview ? <span className="notice-bell__item-preview">{preview}</span> : null}
                          {when ? <span className="notice-bell__item-time">{when}</span> : null}
                        </Link>
                      </li>
                    );
                  }

                  return (
                    <li key={item.id}>
                      <div className={unread ? 'notice-bell__item is-unread' : 'notice-bell__item'}>
                        <span className="notice-bell__item-title">{title}</span>
                        {item.body ? <span className="notice-bell__item-preview">{item.body}</span> : null}
                        {when ? <span className="notice-bell__item-time">{when}</span> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <div className="notice-bell__foot">
            <Link to="/notifications" className="notice-bell__view-all" onClick={() => setOpen(false)}>
              View all
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
