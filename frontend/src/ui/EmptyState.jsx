import { Link } from 'react-router-dom';

export function EmptyState({ children, to, action }) {
  return (
    <p className="empty-state">
      {children}
      {to && action ? (
        <>
          {' '}
          <Link to={to}>{action}</Link>
        </>
      ) : null}
    </p>
  );
}
