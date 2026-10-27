import { Link } from 'react-router-dom';
import {
  formatNotificationTitle,
  formatNotificationWhen,
  notificationActionPath,
  notificationBody,
  notificationSourceMeta,
} from './notification-display.js';

function metaLine(item) {
  const source = notificationSourceMeta(item);
  const when = formatNotificationWhen(item.createdAt);
  if (source && when) {
    return `${source} · ${when}`;
  }
  return source || when || '';
}

export function NotificationStackList({ items, onOpenItem, allowMarkRead = false, onMarkRead }) {
  if (!items?.length) {
    return null;
  }

  return (
    <ul className="stack-list">
      {items.map((item) => {
        const target = notificationActionPath(item);
        const title = formatNotificationTitle(item);
        const body = notificationBody(item);
        const line = metaLine(item);
        const unread = !item.readAt;

        if (target) {
          return (
            <li key={item.id}>
              <Link
                to={target}
                className={['attention-item', unread && 'is-unread'].filter(Boolean).join(' ')}
                onClick={() => onOpenItem?.(item)}
              >
                <span>
                  <span className="attention-item__title">{title}</span>
                  {body ? <span className="attention-item__meta">{body}</span> : null}
                  {line ? <span className="attention-item__meta">{line}</span> : null}
                </span>
                <span className="attention-item__go">Open</span>
              </Link>
            </li>
          );
        }

        return (
          <li key={item.id}>
            <div className={['attention-item stack-item', unread && 'is-unread'].filter(Boolean).join(' ')}>
              <span>
                <span className="attention-item__title">{title}</span>
                {item.body ? <span className="attention-item__meta">{item.body}</span> : null}
                {line ? <span className="attention-item__meta">{line}</span> : null}
              </span>
              {allowMarkRead && unread ? (
                <button type="button" className="text-action" onClick={() => onMarkRead?.(item.id)}>
                  Mark read
                </button>
              ) : (
                <span className="status-pill status-pill--muted">Read</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
