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
    <Link to="/notifications" className="notice-chip" aria-label="Notifications">
      Notifications
      {count ? <span className="notice-chip__count">{count}</span> : null}
    </Link>
  );
}
