import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { communicationApi } from './communication-api.js';

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
    <Link to="/notifications" aria-label="Notifications">
      Notifications{count ? ` (${count})` : ''}
    </Link>
  );
}
