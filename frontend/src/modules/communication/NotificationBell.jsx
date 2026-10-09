import { Link } from 'react-router-dom';
import { communicationApi } from './communication-api.js';
import { useEffect, useState } from 'react';

export function NotificationBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    communicationApi
      .unread()
      .then((body) => {
        if (!cancelled) {
          setCount(body.data.count || 0);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      to="/notifications"
      className="notice-chip"
      aria-label={`Notifications${count ? ` (${count} unread)` : ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.85rem' }}
    >
      <svg
        width="16"
        height="16"
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
      <span>Notifications</span>
      {count ? (
        <span
          className="notice-chip__count"
          style={{
            background: 'var(--brand-600)',
            color: '#fff',
            borderRadius: '999px',
            padding: '1px 6px',
            fontSize: '0.7rem',
            fontWeight: 700,
            lineHeight: 1.2,
          }}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
