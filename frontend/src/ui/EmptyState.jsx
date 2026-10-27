import { Link } from 'react-router-dom';

export function EmptyState({ children, to, action }) {
  return (
    <div className="empty-state">
      <p className="empty-state__message">{children}</p>
      {to && action ? (
        <p className="empty-state__action">
          <Link to={to}>{action}</Link>
        </p>
      ) : null}
    </div>
  );
}
